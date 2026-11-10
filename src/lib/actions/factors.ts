"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/forms/engine";
import type { ActionState } from "@/lib/validation";

const NO_ACCESS: ActionState = { error: "Du har ikke adgang til at udføre denne handling." };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Sæt der er synlige for organisationen: globale + egne */
async function visibleSet(orgId: string, setId: string) {
  return db.factorSet.findFirst({ where: { id: setId, OR: [{ organizationId: null }, { organizationId: orgId }] } });
}

export async function copyFactorSet(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const base = await visibleSet(orgId, str(fd, "setId"));
  if (!base) return NO_ACCESS;
  const name = str(fd, "name").trim() || `${base.name} (egen tilpasning)`;

  const copy = await db.factorSet.create({
    data: { name, version: base.version, description: `Kopi af ${base.name} ${base.version}`, organizationId: orgId, basedOnId: base.id, sourceUrl: base.sourceUrl },
  });
  // Kopiér alle faktorer direkte i databasen (hurtigere end at hente dem op i appen)
  await db.$executeRaw`
    INSERT INTO "EmissionFactor" ("id","setId","year","key","mainCategory","category","parameter1","parameter2","unit","scope1","scope2","scope3","outsideScopes","source","customized")
    SELECT 'f' || md5(random()::text || f."id"), ${copy.id}, f."year", f."key", f."mainCategory", f."category", f."parameter1", f."parameter2", f."unit", f."scope1", f."scope2", f."scope3", f."outsideScopes", f."source", false
    FROM "EmissionFactor" f WHERE f."setId" = ${base.id}`;
  await audit({ organizationId: orgId, userId: user.id, action: "factorSet.copy", entityType: "FactorSet", entityId: copy.id, data: { name } });
  revalidatePath(`/org/${orgId}`, "layout");
  redirect(`/org/${orgId}/settings/factors/${copy.id}`);
}

const factorSchema = z.object({
  scope1: z.string(),
  scope2: z.string(),
  scope3: z.string(),
  outsideScopes: z.string(),
  source: z.string().max(500).optional(),
});

export async function updateFactor(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const factor = await db.emissionFactor.findFirst({ where: { id: str(fd, "factorId"), set: { organizationId: orgId } } });
  if (!factor) return { error: "Kun faktorer i egne faktorsæt kan rettes." };

  const parsed = factorSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Ugyldige værdier" };
  const values = {
    scope1: toNumber(parsed.data.scope1),
    scope2: toNumber(parsed.data.scope2),
    scope3: toNumber(parsed.data.scope3),
    outsideScopes: toNumber(parsed.data.outsideScopes),
  };
  if (Object.values(values).some((v) => v === null || v < 0)) return { error: "Alle værdier skal være tal på 0 eller derover." };

  await db.emissionFactor.update({
    where: { id: factor.id },
    data: { ...(values as Record<string, number>), source: parsed.data.source?.trim() || factor.source, customized: true },
  });
  await audit({ organizationId: orgId, userId: user.id, action: "factor.update", entityType: "EmissionFactor", entityId: factor.id, data: { name: factor.key, year: factor.year, ...values } });
  revalidatePath(`/org/${orgId}`, "layout");
  return { ok: "Faktoren er gemt." };
}

export async function setPeriodFactorSet(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const period = await db.reportingPeriod.findFirst({ where: { id: str(fd, "periodId"), organizationId: orgId } });
  if (!period) return NO_ACCESS;
  if (await db.report.count({ where: { periodId: period.id, status: "APPROVED" } })) {
    return { error: `Rapporteringsår ${period.year} har en godkendt rapport. Faktorsættet kan ikke skiftes.` };
  }
  const setId = str(fd, "setId") || null;
  if (setId && !(await visibleSet(orgId, setId))) return NO_ACCESS;

  await db.reportingPeriod.update({ where: { id: period.id }, data: { factorSetId: setId } });
  await audit({ organizationId: orgId, userId: user.id, action: "period.factorSet", entityType: "ReportingPeriod", entityId: period.id, data: { year: period.year } });
  revalidatePath(`/org/${orgId}`, "layout");
  return { ok: `Faktorsæt for ${period.year} er gemt.` };
}

export async function deleteFactorSet(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const orgId = str(fd, "orgId");
  const { user, access } = await requireOrgAccess(orgId);
  if (!access.canManageOrg) return NO_ACCESS;
  const set = await db.factorSet.findFirst({ where: { id: str(fd, "setId"), organizationId: orgId }, include: { periods: { include: { reports: { where: { status: "APPROVED" } } } } } });
  if (!set) return NO_ACCESS;
  if (set.periods.some((p) => p.reports.length > 0)) return { error: "Faktorsættet bruges af et år med en godkendt rapport og kan ikke slettes." };
  await db.factorSet.delete({ where: { id: set.id } });
  await audit({ organizationId: orgId, userId: user.id, action: "factorSet.delete", entityType: "FactorSet", entityId: set.id, data: { name: set.name } });
  revalidatePath(`/org/${orgId}`, "layout");
  redirect(`/org/${orgId}/settings/factors`);
}
