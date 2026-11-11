"use server";

import { requireOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { lookupGeoFacts, type GeoFacts } from "@/lib/geo-facts";

export type GeoFactsResult = ({ ok: true } & GeoFacts) | { ok: false; error: string };

/** Slår Natura 2000 og vandstress op ud fra lokationens koordinater. Gemmer intet. */
export async function suggestGeoFacts(orgId: string, locationId: string): Promise<GeoFactsResult> {
  const { access } = await requireOrgAccess(orgId);
  const location = await db.location.findFirst({ where: { id: locationId, company: { organizationId: orgId } }, select: { id: true, companyId: true, latitude: true, longitude: true } });
  if (!location || !access.canViewLocation(location)) return { ok: false, error: "Du har ikke adgang til denne lokation." };
  if (location.latitude === null || location.longitude === null) {
    return { ok: false, error: "Lokationen har ingen koordinater endnu. Tilføj dem under lokationens stamdata på selskabssiden, og prøv igen." };
  }
  return { ok: true, ...(await lookupGeoFacts(location.latitude, location.longitude)) };
}
