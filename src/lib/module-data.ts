import "server-only";
import { db } from "./db";
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

  const [ctx, locked] = await Promise.all([formContext(period.id, company.id), isLocked(period.id, company.id)]);
  return { def, period, company, location, ctx, locked, canEdit: canEditTarget && !locked, targetKey: targetKeyOf(target) };
}

/** B+C hvis mindst én rapport i året, der omfatter selskabet, er sat til Udvidet Modul */
export async function formContext(periodId: string, companyId: string): Promise<FormContext> {
  const [comprehensive, general, locations] = await Promise.all([
    db.report.count({ where: { periodId, module: "BASIC_AND_COMPREHENSIVE", companies: { some: { companyId } } } }),
    db.moduleData.findUnique({ where: { periodId_moduleKey_targetKey: { periodId, moduleKey: "company.general", targetKey: `company:${companyId}` } } }),
    db.location.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } }),
  ]);
  const employees = (general?.answers as Record<string, unknown> | undefined)?.employees;
  return {
    comprehensive: comprehensive > 0,
    employees: typeof employees === "number" ? employees : null,
    locations: locations.map((l) => ({ value: l.id, label: `${l.name} – ${l.address}` })),
  };
}

/** Data låses, når selskabet indgår i en godkendt rapport for året */
export async function isLocked(periodId: string, companyId: string) {
  return (await db.report.count({ where: { periodId, status: "APPROVED", companies: { some: { companyId } } } })) > 0;
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
