/** Koordinater for en adresse (WGS84 decimalgrader) samt den adresse, tjenesten matchede. */
export type GeocodeHit = {
  latitude: number;
  longitude: number;
  matched: string;
  /** Tjenesten fandt selve husnummeret/bygningen – ellers er punktet kun omtrentligt (fx midt på vejen) */
  precise: boolean;
};

export type GeocodeResult = { ok: true; hit: GeocodeHit } | { ok: false; error: string };

const NOT_FOUND = "Adressen blev ikke fundet. Kontrollér adressen, eller indtast koordinaterne manuelt.";
const UNAVAILABLE = "Adresseopslaget er ikke tilgængeligt lige nu. Indtast koordinaterne manuelt.";

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Oversætter et svar fra Nominatim (OpenStreetMap) til et koordinatsæt. */
export function mapNominatimResponse(json: unknown): GeocodeResult {
  if (!Array.isArray(json)) return { ok: false, error: UNAVAILABLE };
  const first = json[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== "object") return { ok: false, error: NOT_FOUND };
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { ok: false, error: UNAVAILABLE };
  const address = first.address as Record<string, unknown> | undefined;
  return {
    ok: true,
    hit: {
      latitude: round6(latitude),
      longitude: round6(longitude),
      matched: typeof first.display_name === "string" ? first.display_name : "",
      precise: typeof address?.house_number === "string" && address.house_number !== "",
    },
  };
}

/** Finder koordinater for en adresse via Nominatim (OpenStreetMap). Virker også for udenlandske adresser. */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: address, format: "jsonv2", limit: "1", addressdetails: "1", "accept-language": "da" }).toString();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": process.env.GEOCODE_USER_AGENT ?? "esg-webapp" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: UNAVAILABLE };
    return mapNominatimResponse(await res.json());
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}
