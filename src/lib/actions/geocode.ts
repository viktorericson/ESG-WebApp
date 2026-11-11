"use server";

import { requireUser } from "@/lib/auth";
import { geocodeAddress, type GeocodeResult } from "@/lib/geocode";

/** Finder koordinater for en adresse til forudfyldning af lokationsformularen. Gemmer intet. */
export async function geocodeLocationAddress(address: string): Promise<GeocodeResult> {
  await requireUser();
  const q = address.trim();
  if (q.length < 3 || q.length > 300) return { ok: false, error: "Udfyld adressen først." };
  return geocodeAddress(q);
}
