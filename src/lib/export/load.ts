import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { calculateReport, calculateReportPrevious } from "../calc/server";
import { db } from "../db";
import { storage } from "../storage";
import { fillEsgTemplate, type Logo } from "./esg-template";
import { imageSize } from "./image-size";
import { buildExportModel, type ExportCompany, type ExportModel } from "./model";
import { readContent, type ReportContent } from "../report-content";
import { buildSummary, type Summary } from "../summary";
import { previousReportFor } from "../reports";
import { buildPreviews, withPrevious, type Previews } from "./preview";

type Answers = Record<string, unknown>;

const TEMPLATE = path.join(process.cwd(), "templates", "esg_skabelon_dansk.pptx");

/** Organisationens logo til rapporter, hvis der er uploadet et */
export async function loadLogo(organizationId: string): Promise<Logo | null> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { logoKey: true } });
  if (!org?.logoKey) return null;
  const data = new Uint8Array(await storage.get(org.logoKey));
  const size = imageSize(data);
  return size ? { data, ext: size.type, width: size.width, height: size.height } : null;
}

/** Samler alt til eksportmodellen for en rapport */
export async function loadExportInput(reportId: string) {
  const report = await db.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      period: { include: { organization: true } },
      companies: {
        include: {
          company: { include: { locations: { where: { archivedAt: null }, orderBy: { name: "asc" } } } },
        },
      },
    },
  });
  const companies = report.companies
    .map((rc) => rc.company)
    .filter((c) => !c.archivedAt)
    .sort((a, b) => (a.id === report.reportingCompanyId ? -1 : b.id === report.reportingCompanyId ? 1 : a.name.localeCompare(b.name, "da")));

  const rows = await db.moduleData.findMany({
    where: { periodId: report.periodId, companyId: { in: companies.map((c) => c.id) }, status: { not: "NOT_RELEVANT" } },
    select: { moduleKey: true, companyId: true, locationId: true, answers: true },
  });
  const answers = (companyId: string, locationId: string | null) =>
    Object.fromEntries(rows.filter((r) => r.companyId === companyId && r.locationId === locationId).map((r) => [r.moduleKey, r.answers as Answers]));

  const exportCompanies: ExportCompany[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    cvr: c.cvr,
    address: c.address,
    legalForm: c.legalForm,
    naceCodes: c.naceCodes,
    modules: answers(c.id, null),
    locations: c.locations.map((l) => ({ id: l.id, name: l.name, address: l.address, latitude: l.latitude, longitude: l.longitude, modules: answers(c.id, l.id) })),
  }));

  const { group, factorSet, factorYear } = await calculateReport(report.id);
  return {
    report,
    input: {
      reportName: report.name,
      organizationName: report.period.organization.name,
      year: report.period.year,
      comprehensive: report.module === "BASIC_AND_COMPREHENSIVE",
      consolidated: report.basis === "CONSOLIDATED",
      approved: report.status === "APPROVED",
      omissions: report.omissions,
      reportingCompanyId: report.reportingCompanyId,
      companies: exportCompanies,
      group,
      factorNote: factorSet ? `Emissionsfaktorer: ${factorSet.name} ${factorSet.version}${factorYear ? ` (${factorYear})` : ""}` : null,
    },
  };
}

/** Bygger PowerPoint-filen for en rapport */
export async function buildReportPptx(reportId: string) {
  const { report, input } = await loadExportInput(reportId);
  const [template, logo] = await Promise.all([readFile(TEMPLATE), loadLogo(report.period.organizationId)]);
  const model = buildExportModel(input);
  const extras = await loadReportExtras(reportId, model);
  const pictures: Record<string, ExportImage[]> = {};
  for (const img of extras.images) (pictures[img.slot] ??= []).push(img);
  const { buffer, leftovers } = await fillEsgTemplate(template, model, logo, {
    content: extras.content,
    pictures,
    summary: extras.summary,
    brandColor: extras.brandColor,
    cover: extras.cover,
  });
  if (leftovers.length) console.warn(`[eksport] Pladsholdere uden data i rapport ${reportId}:`, leftovers);
  return { buffer, report, model };
}

/** Ledelsesoversigtens nøgletal for rapporten (i år og året før) */
export async function loadSummary(reportId: string, model?: ExportModel): Promise<Summary> {
  const [{ group }, previous] = await Promise.all([calculateReport(reportId), calculateReportPrevious(reportId)]);
  const m = model ?? buildExportModel((await loadExportInput(reportId)).input);
  const withPractice = m.b2.rows.filter((r) => r.has === "Ja" || r.has.startsWith("Delvist"));
  return buildSummary(m.year, group, previous ? { year: previous.year, r: previous.group } : null, {
    certifications: m.b1.certifications.length,
    policies: withPractice.length,
    policiesWithTargets: withPractice.filter((r) => r.targets === "Ja" || r.targets.startsWith("Delvist")).length,
  });
}

export type ExportImage = { slot: string; caption: string | null; data: Uint8Array; ext: "png" | "jpeg"; width: number; height: number };

/** Det, der ikke er tal: tekster, billeder, ledelsesoversigt og kundens design */
export type ReportExtras = {
  content: ReportContent;
  images: ExportImage[];
  summary: Summary | null;
  brandColor: string | null;
  cover: { data: Uint8Array; ext: "png" | "jpeg"; width: number; height: number } | null;
};

export async function loadReportExtras(reportId: string, model: ExportModel): Promise<ReportExtras> {
  const report = await db.report.findUniqueOrThrow({
    where: { id: reportId },
    select: {
      content: true,
      images: { orderBy: [{ slot: "asc" }, { sort: "asc" }, { createdAt: "asc" }] },
      period: { select: { organization: { select: { brandColor: true, coverKey: true } } } },
    },
  });
  const content = readContent(report.content);
  const images: ExportImage[] = [];
  for (const img of report.images) {
    const data = new Uint8Array(await storage.get(img.storageKey));
    const size = imageSize(data);
    if (size) images.push({ slot: img.slot, caption: img.caption, data, ext: size.type, width: size.width, height: size.height });
  }
  const org = report.period.organization;
  let cover: ReportExtras["cover"] = null;
  if (org.coverKey) {
    const data = new Uint8Array(await storage.get(org.coverKey));
    const size = imageSize(data);
    if (size) cover = { data, ext: size.type, width: size.width, height: size.height };
  }
  const summary = content.summary?.show === false ? null : await loadSummary(reportId, model);
  return { content, images, summary, brandColor: org.brandColor, cover };
}

/** Indrapporterede data pr. afsnit til kommentarfelterne – med året før, hvis der er en rapport for det */
export async function loadPreviews(reportId: string): Promise<Previews> {
  const { report, input } = await loadExportInput(reportId);
  const current = buildPreviews(buildExportModel(input));
  const prevReport = await previousReportFor({ ...report, period: { organizationId: report.period.organizationId, year: report.period.year } });
  if (!prevReport) return current;
  const prev = await loadExportInput(prevReport.id);
  return withPrevious(current, buildPreviews(buildExportModel(prev.input)), { now: report.period.year, before: prev.input.year });
}
