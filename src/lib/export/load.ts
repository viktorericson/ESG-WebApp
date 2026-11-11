import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { calculateReport } from "../calc/server";
import { db } from "../db";
import { storage } from "../storage";
import { fillEsgTemplate, type Logo } from "./esg-template";
import { imageSize } from "./image-size";
import { buildExportModel, type ExportCompany } from "./model";

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
  const { buffer, leftovers } = await fillEsgTemplate(template, model, logo);
  if (leftovers.length) console.warn(`[eksport] Pladsholdere uden data i rapport ${reportId}:`, leftovers);
  return { buffer, report, model };
}
