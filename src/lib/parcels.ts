/**
 * Grundgrænser fra Matriklen via Dataforsyningens søgetjeneste (GSearch). Kræver DATAFORSYNINGEN_TOKEN.
 * Koordinater er i EPSG:25832 (UTM zone 32N, meter), som er Matriklens eget system.
 */

export type Ring = [number, number][];
/** Én polygon = ydre ring efterfulgt af eventuelle huller */
export type Polygon = Ring[];

export type Parcel = {
  bfeNumber: string;
  /** Matrikelbetegnelser, fx "98ar, Birkerød By, Bistrup" */
  labels: string[];
  polygons: Polygon[];
};

/** WGS84 → EPSG:25832 (UTM zone 32N på GRS80), Krüger-rækker. Nøjagtig til under en millimeter inden for zonen. */
export function wgs84ToUtm32(latitude: number, longitude: number): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const n = f / (2 - f);
  const A = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const alpha = [n / 2 - (2 * n ** 2) / 3 + (5 * n ** 3) / 16, (13 * n ** 2) / 48 - (3 * n ** 3) / 5, (61 * n ** 3) / 240];
  const rad = Math.PI / 180;
  const phi = latitude * rad;
  const lambda = (longitude - 9) * rad;
  const e = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lambda));
  const eta = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let x = eta;
  let y = xi;
  alpha.forEach((al, i) => {
    const j = 2 * (i + 1);
    x += al * Math.cos(j * xi) * Math.sinh(j * eta);
    y += al * Math.sin(j * xi) * Math.cosh(j * eta);
  });
  return [500000 + 0.9996 * A * x, 0.9996 * A * y];
}

type Row = { bfenummer?: unknown; visningstekst?: unknown; geometri?: { type?: unknown; coordinates?: unknown } };

const isRing = (v: unknown): v is Ring => Array.isArray(v) && v.length >= 4 && v.every((p) => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number");

/** Samler jordstykkerne for ét BFE-nummer fra et GSearch-svar. null = ingen jordstykker med det nummer. */
export function mapParcel(json: unknown, bfeNumber: string): Parcel | null {
  if (!Array.isArray(json)) return null;
  const parcel: Parcel = { bfeNumber, labels: [], polygons: [] };
  for (const row of json as Row[]) {
    // Søgningen matcher på præfiks, så 237931 finder også 2379317 – behold kun det præcise nummer
    if (String(row?.bfenummer) !== bfeNumber || row.geometri?.type !== "MultiPolygon" || !Array.isArray(row.geometri.coordinates)) continue;
    const polygons = (row.geometri.coordinates as unknown[]).filter((p): p is Polygon => Array.isArray(p) && p.length > 0 && p.every(isRing));
    if (polygons.length === 0) continue;
    parcel.polygons.push(...polygons);
    if (typeof row.visningstekst === "string") parcel.labels.push(row.visningstekst);
  }
  return parcel.polygons.length ? parcel : null;
}

/** Yderpunkter for en grund: [minX, minY, maxX, maxY] */
export function parcelBounds(parcel: Parcel): [number, number, number, number] {
  const pts = parcel.polygons.flatMap((p) => p[0]);
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

async function search(params: Record<string, string>): Promise<unknown> {
  const token = process.env.DATAFORSYNINGEN_TOKEN;
  if (!token) return null;
  const url = new URL("https://api.dataforsyningen.dk/rest/gsearch/v2.0/matrikel");
  url.search = new URLSearchParams({ ...params, token }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Alle jordstykker i den samlede faste ejendom med dette BFE-nummer. */
export async function parcelByBfe(bfeNumber: string): Promise<Parcel | null> {
  if (!/^\d{1,10}$/.test(bfeNumber)) return null;
  return mapParcel(await search({ q: bfeNumber, limit: "100" }), bfeNumber);
}

/**
 * Ejendommen, som punktet ligger på. Tjenesten kræver en søgetekst, så der søges på hvert begyndelsesciffer
 * i matrikelnummeret (1–9) sammen med punktet – højst ét af opslagene giver et træf.
 */
export async function parcelAt(latitude: number, longitude: number): Promise<Parcel | null> {
  const [x, y] = wgs84ToUtm32(latitude, longitude);
  const filter = `INTERSECTS(geometri,SRID=25832;POINT(${x.toFixed(2)} ${y.toFixed(2)}))`;
  const hits = await Promise.all(["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((q) => search({ q, filter, limit: "1" })));
  const row = hits.flatMap((h) => (Array.isArray(h) ? (h as Row[]) : []))[0];
  if (row?.bfenummer == null) return null;
  return parcelByBfe(String(row.bfenummer));
}

/** Grunden for en lokation: det angivne BFE-nummer, ellers ejendommen på koordinaterne. null uden token eller træf. */
export async function parcelForLocation(loc: { bfeNumber: string | null; latitude: number | null; longitude: number | null }): Promise<Parcel | null> {
  if (!process.env.DATAFORSYNINGEN_TOKEN) return null;
  if (loc.bfeNumber) return parcelByBfe(loc.bfeNumber);
  if (loc.latitude === null || loc.longitude === null) return null;
  return parcelAt(loc.latitude, loc.longitude);
}
