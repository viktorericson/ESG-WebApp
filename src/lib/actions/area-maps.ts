"use server";

import { revalidatePath } from "next/cache";
import { MAP_BUFFER_M, MAP_HEIGHT, MAP_WIDTH, renderAreaMap } from "@/lib/area-maps";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { parcelForLocation } from "@/lib/parcels";
import { imageLimit, slotLabel } from "@/lib/report-content";
import { reportImageAccess } from "@/lib/report-images";
import { storage } from "@/lib/storage";
import { generateToken } from "@/lib/tokens";

const SLOTS = ["section:b5", "appendix"] as const;
/** Kendetegner automatisk dannede kort i storageKey, så de kan erstattes ved en ny kørsel – også hvis billedteksten er rettet */
const marker = (locationId: string) => `areamap-${locationId}-`;

export type AreaMapsResult =
  | { ok: true; added: number; inAppendix: number; withoutCoordinates: string[]; failed: string[]; noRoom: string[] }
  | { ok: false; error: string };

/**
 * Danner et kort fra Danmarks Arealinformation for hver lokation i rapporten og lægger det som billede under B5
 * (og i bilag, når B5 er fyldt). Tidligere automatisk dannede kort for samme lokation erstattes.
 */
export async function generateAreaMaps(reportId: string): Promise<AreaMapsResult> {
  const found = await reportImageAccess(reportId);
  if (!found) return { ok: false, error: "Rapporten blev ikke fundet." };
  if (!found.canEdit) return { ok: false, error: found.lockedReason ?? "Du har ikke adgang til at ændre rapportens billeder." };

  const report = await db.report.findUniqueOrThrow({
    where: { id: reportId },
    select: {
      reportingCompanyId: true,
      companies: { select: { company: { select: { id: true, name: true, archivedAt: true, locations: { where: { archivedAt: null }, orderBy: { name: "asc" } } } } } },
    },
  });
  const locations = report.companies
    .map((rc) => rc.company)
    .filter((c) => !c.archivedAt)
    .sort((a, b) => (a.id === report.reportingCompanyId ? -1 : b.id === report.reportingCompanyId ? 1 : a.name.localeCompare(b.name, "da")))
    .flatMap((c) => c.locations);
  if (locations.length === 0) return { ok: false, error: "Rapportens selskaber har ingen lokationer." };

  const date = new Intl.DateTimeFormat("da-DK", { dateStyle: "long" }).format(new Date());
  const result = { added: 0, inAppendix: 0, withoutCoordinates: [] as string[], failed: [] as string[], noRoom: [] as string[] };

  for (const loc of locations) {
    // Grunden findes ud fra BFE-nummeret, ellers ud fra koordinaterne. Uden grund tegnes en cirkel om punktet.
    const parcel = await parcelForLocation(loc);
    if (!parcel && (loc.latitude === null || loc.longitude === null)) {
      result.withoutCoordinates.push(loc.name);
      continue;
    }
    const map = await renderAreaMap({ latitude: loc.latitude, longitude: loc.longitude, parcel });
    if (!map) {
      result.failed.push(loc.name);
      continue;
    }

    // Fjern lokationens tidligere kort, før pladsen tælles op
    const old = await db.reportImage.findMany({ where: { reportId, slot: { in: [...SLOTS] }, storageKey: { contains: marker(loc.id) } } });
    for (const img of old) {
      await db.reportImage.delete({ where: { id: img.id } });
      await storage.delete(img.storageKey);
    }

    let slot: (typeof SLOTS)[number] | null = null;
    let count = 0;
    for (const s of SLOTS) {
      count = await db.reportImage.count({ where: { reportId, slot: s } });
      if (count < imageLimit(s)) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      result.noRoom.push(loc.name);
      continue;
    }

    const key = `${found.orgId}/report-${reportId}/${marker(loc.id)}${generateToken(12).replace(/[^a-zA-Z0-9_-]/g, "")}`;
    await storage.put(key, map.data, "image/png");
    await db.reportImage.create({
      data: {
        reportId,
        slot,
        sort: count,
        storageKey: key,
        contentType: "image/png",
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        caption: `${loc.name}, ${loc.address}: beskyttede naturområder omkring ${parcel ? `grunden (BFE ${parcel.bfeNumber}, skraveret). Den brune linje viser ${MAP_BUFFER_M} m fra grundens grænse` : `lokationen. Den brune cirkel viser ${MAP_BUFFER_M} m`}. Kilde: Danmarks Arealinformation, ${date}.`.slice(0, 300),
      },
    });
    result.added++;
    if (slot === "appendix") result.inAppendix++;
  }

  if (result.added > 0) {
    await audit({ organizationId: found.orgId, userId: found.userId, action: "report.image.add", entityType: "Report", entityId: reportId, data: { slot: slotLabel("section:b5"), kilde: "Danmarks Arealinformation", antal: result.added } });
    revalidatePath(`/org/${found.orgId}/reports/${reportId}`, "layout");
  }
  return { ok: true, ...result };
}
