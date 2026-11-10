"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveIncluded, type CompanyNode } from "@/lib/report-scope";
import { orgCompanies } from "@/lib/reports";
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
