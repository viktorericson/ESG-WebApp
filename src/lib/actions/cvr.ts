"use server";

import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { addressKey, lookupCvr, lookupCvrUnits, type CvrResult, type CvrUnit } from "@/lib/cvr";
import { cvrSchema } from "@/lib/validation";

/** Henter stamdata fra CVR til forudfyldning af selskabsformularen. Gemmer intet. */
export async function lookupCompanyByCvr(orgId: string, cvr: string): Promise<CvrResult> {
  await requireOrgAccess(orgId);
  const parsed = cvrSchema.safeParse(cvr);
  if (!parsed.success) return { ok: false, error: "CVR-nummer skal være 8 cifre" };
  return lookupCvr(parsed.data);
}

export type LocationSuggestions = { ok: true; units: CvrUnit[]; alreadyAdded: number } | { ok: false; error: string };

/** Foreslår lokationer ud fra selskabets aktive P-enheder i CVR. Adresser, der allerede er oprettet, udelades. Gemmer intet. */
export async function suggestLocationsFromCvr(orgId: string, companyId: string): Promise<LocationSuggestions> {
  const { access } = await requireOrgAccess(orgId);
  const company = await db.company.findFirst({
    where: { id: companyId, organizationId: orgId, archivedAt: null },
    select: { cvr: true, locations: { where: { archivedAt: null }, select: { address: true } } },
  });
  if (!company || !access.managesCompany(companyId)) return { ok: false, error: "Du har ikke adgang til at udføre denne handling." };

  const result = await lookupCvrUnits(company.cvr);
  if (!result.ok) return result;
  const existing = new Set(company.locations.map((l) => addressKey(l.address)));
  const units = result.units.filter((u) => !existing.has(addressKey(u.address)));
  return { ok: true, units, alreadyAdded: result.units.length - units.length };
}
