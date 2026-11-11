import "server-only";
import { db } from "./db";
import { scope3FactorOptions } from "./calc/server";
import { highImpactSector } from "./nace";
import { getModule } from "./forms/registry";
import type { FormContext, ModuleDef } from "./forms/types";
import type { Access } from "./permissions";

export type Target = { companyId: string; locationId?: string | null };

export const targetKeyOf = (t: Target) => (t.locationId ? `location:${t.locationId}` : `company:${t.companyId}`);

/**
 * Slår modul, periode, selskab/lokation op og afgør adgang, kontekst og lås.
 * Returnerer null hvis noget ikke hører til organisationen, eller brugeren ikke må se det.
 */
export async function loadModuleScope(orgId: string, access: Access, periodId: string, moduleKey: string, target: Target) {
  const def = getModule(moduleKey);
  if (!def || (def.scope === "location") !== !!target.locationId) return null;

  const [period, company, location] = await Promise.all([
    db.reportingPeriod.findFirst({ where: { id: periodId, organizationId: orgId } }),
    db.company.findFirst({ where: { id: target.companyId, organizationId: orgId, archivedAt: null } }),
    target.locationId ? db.location.findFirst({ where: { id: target.locationId, companyId: target.companyId, archivedAt: null } }) : null,
  ]);
  if (!period || !company || (target.locationId && !location)) return null;

  const canView = location ? access.canViewLocation(location) : access.canViewAll || access.managesCompany(company.id);
  if (!canView) return null;
  const canEditTarget = location ? access.canReportLocation(location) : access.managesCompany(company.id);

  const [ctx, lockReason] = await Promise.all([
    formContext(period.id, company.id, { scope3Factors: def.key === "company.scope3" }),
    lockReasonFor(period.id, company.id),
  ]);
  const locked = lockReason !== null;
  return { def, period, company, location, ctx, locked, lockReason, canEdit: canEditTarget && !locked, targetKey: targetKeyOf(target) };
}

/** B+C hvis mindst én rapport i året, der omfatter selskabet, er sat til Udvidet Modul */
export async function formContext(periodId: string, companyId: string, opts: { scope3Factors?: boolean } = {}): Promise<FormContext> {
  const [comprehensive, general, locations, company] = await Promise.all([
    db.report.count({ where: { periodId, module: "BASIC_AND_COMPREHENSIVE", companies: { some: { companyId } } } }),
    db.moduleData.findUnique({ where: { periodId_moduleKey_targetKey: { periodId, moduleKey: "company.general", targetKey: `company:${companyId}` } } }),
    db.location.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } }),
    db.company.findUnique({ where: { id: companyId }, select: { naceCodes: true } }),
  ]);
  const employees = (general?.answers as Record<string, unknown> | undefined)?.employees;
  return {
    comprehensive: comprehensive > 0,
    employees: typeof employees === "number" ? employees : null,
    locations: locations.map((l) => ({ value: l.id, label: `${l.name} – ${l.address}` })),
    highImpactSector: highImpactSector(company?.naceCodes ?? []),
    ...(opts.scope3Factors ? { scope3Factors: await scope3FactorOptions(periodId) } : {}),
  };
}

/**
 * Data låses, når selskabet indgår i en godkendt rapport, eller når selskabets data for året
 * er indsendt til gennemgang eller godkendt. Returnerer en forklaring, eller null hvis data er åbne.
 */
export async function lockReasonFor(periodId: string, companyId: string): Promise<string | null> {
  const [approvedReports, submission] = await Promise.all([
    db.report.count({ where: { periodId, status: "APPROVED", companies: { some: { companyId } } } }),
    db.companySubmission.findUnique({ where: { periodId_companyId: { periodId, companyId } } }),
  ]);
  if (approvedReports > 0) return "Data er låst, fordi selskabet indgår i en godkendt rapport for året.";
  if (submission?.status === "SUBMITTED") return "Data er indsendt til gennemgang og kan ikke ændres, før koncernadmin har godkendt dem eller sendt dem tilbage.";
  if (submission?.status === "APPROVED") return "Data er godkendt af koncernadmin. Kontakt koncernadmin, hvis noget skal rettes.";
  return null;
}

export async function isLocked(periodId: string, companyId: string) {
  return (await lockReasonFor(periodId, companyId)) !== null;
}

export async function getModuleData(periodId: string, moduleKey: string, targetKey: string) {
  return db.moduleData.findUnique({
    where: { periodId_moduleKey_targetKey: { periodId, moduleKey, targetKey } },
    include: { attachments: { orderBy: { createdAt: "asc" } }, updatedBy: true },
  });
}

/** Status for alle moduler for et mål i et år */
export async function moduleStatuses(periodId: string, targetKey: string) {
  const rows = await db.moduleData.findMany({ where: { periodId, targetKey }, select: { moduleKey: true, status: true, updatedAt: true } });
  return new Map(rows.map((r) => [r.moduleKey, r]));
}

export type LoadedScope = NonNullable<Awaited<ReturnType<typeof loadModuleScope>>>;
export type { ModuleDef };
