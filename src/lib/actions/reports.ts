"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveIncluded, type CompanyNode } from "@/lib/report-scope";
import { compactContent, readContent, reportContentSchema, type ReportContent } from "@/lib/report-content";
import { orgCompanies, previousReportFor } from "@/lib/reports";
import { fieldErrors, reportSchema, reportStatuses, type ActionState } from "@/lib/validation";

const NO_ACCESS: ActionState = { error: "Du har ikke adgang til at udføre denne handling." };

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "");
}

function parseReport(fd: FormData, companies: CompanyNode[]) {
  const parsed = reportSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: { fieldErrors: fieldErrors(parsed.error) } as ActionState };
  const scope = resolveIncluded(companies, parsed.data.reportingCompanyId, parsed.data.basis, fd.getAll("companyIds").map(String));
  if (!scope.ok) return { error: { fieldErrors: { companyIds: scope.error } } as ActionState };
  return { data: parsed.data, ids: scope.ids };
}

export async function createReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const period = await db.reportingPeriod.findFirst({ where: { id: str(fd, "periodId"), organizationId: orgId } });
  if (!period) return NO_ACCESS;

  const result = parseReport(fd, await orgCompanies(orgId));
  if (result.error) return result.error;

  const report = await db.report.create({
    data: { ...result.data, periodId: period.id, companies: { create: result.ids.map((companyId) => ({ companyId })) } },
  });
  await audit({ organizationId: orgId, userId: user.id, action: "report.create", entityType: "Report", entityId: report.id, data: { name: report.name } });
  revalidatePath(`/org/${orgId}`, "layout");
  redirect(`/org/${orgId}/reports/${report.id}`);
}

export async function updateReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const report = await db.report.findFirst({ where: { id: str(fd, "reportId"), period: { organizationId: orgId } } });
  if (!report) return NO_ACCESS;
  if (report.status === "APPROVED") return { error: "Rapporten er godkendt. Sæt den tilbage til “Under udarbejdelse” for at ændre opsætningen." };

  const result = parseReport(fd, await orgCompanies(orgId));
  if (result.error) return result.error;

  await db.$transaction([
    db.report.update({ where: { id: report.id }, data: result.data }),
    db.reportCompany.deleteMany({ where: { reportId: report.id } }),
    db.reportCompany.createMany({ data: result.ids.map((companyId) => ({ reportId: report.id, companyId })) }),
  ]);
  await audit({ organizationId: orgId, userId: user.id, action: "report.update", entityType: "Report", entityId: report.id, data: { name: result.data.name, companies: result.ids.length } });
  revalidatePath(`/org/${orgId}`, "layout");
  return { ok: "Rapportopsætningen er gemt." };
}

export async function setReportStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const status = str(fd, "status") as (typeof reportStatuses)[number];
  if (!reportStatuses.includes(status)) return { error: "Ugyldig status" };
  if (status === "APPROVED") {
    const report = await db.report.findFirst({ where: { id: str(fd, "reportId"), period: { organizationId: orgId } }, include: { companies: { include: { company: true } } } });
    if (!report) return NO_ACCESS;
    const approved = await db.companySubmission.findMany({ where: { periodId: report.periodId, status: "APPROVED", companyId: { in: report.companies.map((c) => c.companyId) } }, select: { companyId: true } });
    const missing = report.companies.filter((c) => !approved.some((a) => a.companyId === c.companyId)).map((c) => c.company.name);
    if (missing.length) return { error: `Rapporten kan først godkendes, når alle selskabers data er godkendt. Mangler: ${missing.join(", ")}.` };
  }
  const { count } = await db.report.updateMany({ where: { id: str(fd, "reportId"), period: { organizationId: orgId } }, data: { status } });
  if (!count) return NO_ACCESS;
  await audit({ organizationId: orgId, userId: user.id, action: "report.status", entityType: "Report", entityId: str(fd, "reportId"), data: { status } });
  revalidatePath(`/org/${orgId}`, "layout");
  return { ok: "Status er opdateret." };
}

export async function deleteReport(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const report = await db.report.findFirst({ where: { id: str(fd, "reportId"), period: { organizationId: orgId } } });
  if (!report) return NO_ACCESS;
  if (report.status === "APPROVED") return { error: "En godkendt rapport kan ikke slettes." };
  await db.report.delete({ where: { id: report.id } });
  await audit({ organizationId: orgId, userId: user.id, action: "report.delete", entityType: "Report", entityId: report.id, data: { name: report.name } });
  revalidatePath(`/org/${orgId}`, "layout");
  redirect(`/org/${orgId}/reports`);
}

// ---------- Rapportindhold (tekster) ----------

export type ContentSaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

async function editableReport(orgId: string, reportId: string) {
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return { error: "Du har ikke adgang til at redigere rapportens indhold." } as const;
  const report = await db.report.findFirst({ where: { id: reportId, period: { organizationId: orgId } }, include: { period: true } });
  if (!report) return { error: "Rapporten findes ikke." } as const;
  if (report.status === "APPROVED") return { error: "Rapporten er godkendt, så indholdet er låst." } as const;
  return { user, report } as const;
}

/** Autosave af rapportens tekster */
export async function saveReportContent(input: { orgId: string; reportId: string; content: unknown }): Promise<ContentSaveResult> {
  const r = await editableReport(input.orgId, input.reportId);
  if ("error" in r) return { ok: false, error: r.error! };
  const parsed = reportContentSchema.safeParse(input.content);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ugyldigt indhold" };
  const row = await db.report.update({ where: { id: r.report.id }, data: { content: compactContent(parsed.data) as Prisma.InputJsonObject } });
  return { ok: true, savedAt: row.updatedAt.toISOString() };
}

/** Kopierer teksterne fra året før. Eksisterende tekster overskrives kun, hvor sidste år har en tekst. */
export async function copyContentFromPrevious(input: { orgId: string; reportId: string }): Promise<ContentSaveResult & { content?: ReportContent }> {
  const r = await editableReport(input.orgId, input.reportId);
  if ("error" in r) return { ok: false, error: r.error! };
  const prev = await previousReportFor({ ...r.report, period: r.report.period });
  if (!prev) return { ok: false, error: `Der er ingen rapport for ${r.report.period.year - 1} at hente tekster fra.` };
  const old = readContent(prev.content);
  const cur = readContent(r.report.content);
  const merged = compactContent({
    foreword: old.foreword || cur.foreword,
    about: old.about || cur.about,
    summary: { show: cur.summary?.show ?? old.summary?.show ?? true, environment: old.summary?.environment || cur.summary?.environment, social: old.summary?.social || cur.summary?.social, governance: old.summary?.governance || cur.summary?.governance },
    sections: { ...cur.sections, ...old.sections },
    closing: old.closing || cur.closing,
  });
  const row = await db.report.update({ where: { id: r.report.id }, data: { content: merged as Prisma.InputJsonObject } });
  await audit({ organizationId: input.orgId, userId: r.user.id, action: "report.content.copy", entityType: "Report", entityId: r.report.id, data: { from: prev.id } });
  revalidatePath(`/org/${input.orgId}/reports/${r.report.id}`, "layout");
  return { ok: true, savedAt: row.updatedAt.toISOString(), content: merged };
}
