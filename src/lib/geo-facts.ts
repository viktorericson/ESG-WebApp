/**
 * Opslag på en lokations koordinater: Natura 2000-områder (EEA) og vandstress (WRI Aqueduct 4.0).
 * Resultaterne er forslag til modulet "Biodiversitet og geografiske forhold" og gemmes først, når brugeren anvender dem.
 */

/** Afstand, inden for hvilken en lokation foreslås som "nær" et Natura 2000-område */
export const NEAR_METERS = 1000;

export type NaturaSite = { code: string; name: string };
export type NaturaFinding = { relation: "IN" | "NEAR" | "NONE"; sites: NaturaSite[] };

export type WaterStressFinding = {
  /** YES = høj eller ekstremt høj vandstress, NO = lavere, null = kan ikke afgøres ud fra data */
  suggestion: "YES" | "NO" | null;
  /** Aqueducts kategori, fx "Low (<10%)" */
  label: string;
  region: string | null;
};

export type Lookup<T> = { ok: true; value: T } | { ok: false; error: string };

export type GeoFacts = { natura: Lookup<NaturaFinding>; waterStress: Lookup<WaterStressFinding> };

const NATURA_SOURCE = "EEA Natura 2000-datasættet";
const WATER_SOURCE = "WRI Aqueduct 4.0";
const unavailable = (source: string) => `Opslaget i ${source} er ikke tilgængeligt lige nu.`;

/** Uddrager unikke områder fra et svar fra EEA's Natura 2000-korttjeneste (ArcGIS). null = ugyldigt svar. */
export function mapNaturaSites(json: unknown): NaturaSite[] | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return null;
  const sites = new Map<string, NaturaSite>();
  for (const f of features) {
    const a = (f as { attributes?: Record<string, unknown> } | null)?.attributes;
    if (typeof a?.SITECODE === "string" && typeof a.SITENAME === "string") sites.set(a.SITECODE, { code: a.SITECODE, name: a.SITENAME.trim() });
  }
  return [...sites.values()].sort((x, y) => x.name.localeCompare(y.name, "da"));
}

/** Sammenfatter træf i selve punktet og inden for NEAR_METERS til én placering. */
export function naturaFinding(inside: NaturaSite[], nearby: NaturaSite[]): NaturaFinding {
  if (inside.length > 0) return { relation: "IN", sites: inside };
  if (nearby.length > 0) return { relation: "NEAR", sites: nearby };
  return { relation: "NONE", sites: [] };
}

/** Oversætter et svar fra Aqueduct 4.0 (baseline water stress) til et forslag. */
export function mapWaterStress(json: unknown): Lookup<WaterStressFinding> {
  const rows = (json as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) return { ok: false, error: unavailable(WATER_SOURCE) };
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, error: "Aqueduct har ingen data for dette punkt (fx hav eller kyststrækning)." };
  const cat = typeof row.bws_cat === "number" ? row.bws_cat : null;
  // Kategori 3 = High (40-80%), 4 = Extremely High (>80%). -1 (tørt område med lavt forbrug) og -9999 (ingen data) kan ikke afgøres.
  const suggestion = cat === null || cat < 0 ? null : cat >= 3 ? "YES" : "NO";
  const region = [row.name_1, row.name_0].filter((v) => typeof v === "string" && v).join(", ") || null;
  return { ok: true, value: { suggestion, label: typeof row.bws_label === "string" && row.bws_label ? row.bws_label : "No Data", region } };
}

async function getJson(url: URL): Promise<unknown> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const NATURA_URL = "https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Sites/MapServer/2/query";

async function naturaWithin(latitude: number, longitude: number, meters: number): Promise<NaturaSite[] | null> {
  const url = new URL(NATURA_URL);
  url.search = new URLSearchParams({
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(meters),
    units: "esriSRUnit_Meter",
    outFields: "SITECODE,SITENAME",
    returnGeometry: "false",
    f: "json",
  }).toString();
  return mapNaturaSites(await getJson(url));
}

async function lookupNatura(latitude: number, longitude: number): Promise<Lookup<NaturaFinding>> {
  const [inside, nearby] = await Promise.all([naturaWithin(latitude, longitude, 0), naturaWithin(latitude, longitude, NEAR_METERS)]);
  if (!inside || !nearby) return { ok: false, error: unavailable(NATURA_SOURCE) };
  return { ok: true, value: naturaFinding(inside, nearby) };
}

async function lookupWaterStress(latitude: number, longitude: number): Promise<Lookup<WaterStressFinding>> {
  const url = new URL("https://wri-rw.carto.com/api/v2/sql");
  // Koordinaterne er tal fra databasen (valideret ved indtastning) – toFixed sikrer, at kun tal indgår i forespørgslen
  const point = `ST_SetSRID(ST_Point(${longitude.toFixed(6)},${latitude.toFixed(6)}),4326)`;
  url.search = new URLSearchParams({ q: `SELECT bws_cat,bws_label,name_0,name_1 FROM aq4baselineannual WHERE ST_Intersects(the_geom, ${point}) LIMIT 1` }).toString();
  return mapWaterStress(await getJson(url));
}

/** Slår Natura 2000 og vandstress op for et koordinatsæt (WGS84). De to opslag fejler uafhængigt af hinanden. */
export async function lookupGeoFacts(latitude: number, longitude: number): Promise<GeoFacts> {
  const [natura, waterStress] = await Promise.all([lookupNatura(latitude, longitude), lookupWaterStress(latitude, longitude)]);
  return { natura, waterStress };
}
