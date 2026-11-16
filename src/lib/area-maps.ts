/**
 * Kortudsnit fra Danmarks Arealinformation (Danmarks Miljøportal) til rapportens afsnit B5:
 * beskyttede naturområder omkring en lokation, med markør, målestok og signaturforklaring.
 */
import sharp from "sharp";
import { parcelBounds, wgs84ToUtm32, type Parcel } from "./parcels";

const WMS_URL = "https://arealeditering-dist-geo.miljoeportal.dk/geoserver/wms";

/** Lagene tegnes i denne rækkefølge (det sidste øverst). Signaturforklaringen vises i omvendt rækkefølge. */
export const AREA_LAYERS = ["dai:fredede_omr", "dai:bes_naturtyper", "dai:ramsar_omr", "dai:fugle_bes_omr", "dai:habitat_omr"] as const;

export const MAP_WIDTH = 1500;
export const MAP_HEIGHT = 1000;
/** Mindste udsnit: 1.200 × 800 m. Store grunde får et større udsnit, så grund og buffer altid kan ses. */
export const MIN_GROUND_WIDTH_M = 1200;
/** Nærområdet: afstand fra grundens grænse (eller fra punktet, når grunden ikke kendes) */
export const MAP_BUFFER_M = 50;

export type MapView = { bbox: [number, number, number, number]; groundWidth: number };

/**
 * Kortudsnit i EPSG:25832 (meter). Med en grund centreres der på grunden, og udsnittet udvides,
 * så grund plus buffer fylder højst ca. to tredjedele af billedet.
 */
export function mapView(center: [number, number], parcel?: Parcel | null): MapView {
  let [cx, cy] = center;
  let groundWidth = MIN_GROUND_WIDTH_M;
  if (parcel) {
    const [minX, minY, maxX, maxY] = parcelBounds(parcel);
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
    const w = maxX - minX + 2 * MAP_BUFFER_M;
    const h = maxY - minY + 2 * MAP_BUFFER_M;
    groundWidth = Math.max(MIN_GROUND_WIDTH_M, Math.ceil((Math.max(w, (h * MAP_WIDTH) / MAP_HEIGHT) * 1.5) / 100) * 100);
  }
  const halfW = groundWidth / 2;
  const halfH = (halfW * MAP_HEIGHT) / MAP_WIDTH;
  return { bbox: [cx - halfW, cy - halfH, cx + halfW, cy + halfH], groundWidth };
}

/** Pæn længde til målestokken: ca. en sjettedel af kortets bredde */
export function scaleBarMeters(groundWidth: number): number {
  return [2000, 1000, 500, 200, 100, 50].find((m) => m <= groundWidth / 5) ?? 50;
}

function wmsUrl(base: string, params: Record<string, string>): URL {
  const url = new URL(base);
  url.search = new URLSearchParams({ service: "WMS", version: "1.1.1", ...params }).toString();
  return url;
}

async function fetchPng(url: URL): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function getMap(base: string, layers: string, bbox: number[], extra: Record<string, string> = {}) {
  return fetchPng(
    wmsUrl(base, {
      request: "GetMap",
      layers,
      styles: "",
      srs: "EPSG:25832",
      bbox: bbox.map((n) => n.toFixed(1)).join(","),
      width: String(MAP_WIDTH),
      height: String(MAP_HEIGHT),
      format: "image/png",
      transparent: "true",
      ...extra,
    }),
  );
}

/** Dæmpet skærmkort fra Dataforsyningen som baggrund – kun hvis DATAFORSYNINGEN_TOKEN er sat. */
function fetchBackground(bbox: number[]): Promise<Buffer | null> {
  const token = process.env.DATAFORSYNINGEN_TOKEN;
  if (!token) return Promise.resolve(null);
  return getMap("https://api.dataforsyningen.dk/topo_skaermkort_DAF", "dtk_skaermkort_daempet", bbox, { transparent: "false", token });
}

let legendCache: Promise<{ data: Buffer; width: number; height: number }[]> | null = null;

/** Signaturerne hentes fra tjenesten selv, så farverne altid svarer til kortet. Caches i processen. */
function loadLegends() {
  legendCache ??= Promise.all(
    [...AREA_LAYERS].reverse().map(async (layer) => {
      const data = await fetchPng(wmsUrl(WMS_URL, { request: "GetLegendGraphic", format: "image/png", layer, legend_options: "forceLabels:on;fontAntiAliasing:true;fontSize:13" }));
      if (!data) return null;
      const meta = await sharp(data).metadata();
      return { data, width: meta.width ?? 0, height: meta.height ?? 0 };
    }),
  ).then((list) => list.filter((l) => l !== null));
  legendCache.catch(() => (legendCache = null));
  return legendCache;
}

const BLUE = "#0284c7";
const AMBER = "#b45309";

/** Grund (skraveret), buffer om grunden, markør, målestok og kildeangivelse */
function overlaySvg(view: MapView, point: [number, number] | null, parcel: Parcel | null): Buffer {
  const pxPerM = MAP_WIDTH / view.groundWidth;
  const px = ([x, y]: [number, number]) => `${((x - view.bbox[0]) * pxPerM).toFixed(1)} ${((view.bbox[3] - y) * pxPerM).toFixed(1)}`;
  const bufferPx = MAP_BUFFER_M * pxPerM;
  const barM = scaleBarMeters(view.groundWidth);
  const barPx = barM * pxPerM;
  const sx = 28;
  const sy = MAP_HEIGHT - 30;

  let area = "";
  if (parcel) {
    const d = parcel.polygons.map((poly) => poly.map((ring) => `M${ring.map(px).join("L")}Z`).join("")).join("");
    // Bufferen tegnes som en ring: grunden udvidet med bufferen plus linjens bredde, minus grunden udvidet med bufferen
    area = `
      <defs>
        <pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="14" fill="${BLUE}" opacity="0.55"/></pattern>
        <mask id="ring" maskUnits="userSpaceOnUse" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}">
          <path d="${d}" fill="#fff" stroke="#fff" stroke-width="${(2 * bufferPx + 8).toFixed(1)}" stroke-linejoin="round"/>
          <path d="${d}" fill="#000" stroke="#000" stroke-width="${(2 * bufferPx).toFixed(1)}" stroke-linejoin="round"/>
        </mask>
      </defs>
      <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="${AMBER}" mask="url(#ring)"/>
      <path d="${d}" fill="url(#hatch)" fill-rule="evenodd" stroke="${BLUE}" stroke-width="3.5" stroke-linejoin="round"/>`;
  } else if (point) {
    const [cx, cy] = px(point).split(" ");
    area = `<circle cx="${cx}" cy="${cy}" r="${bufferPx.toFixed(0)}" fill="none" stroke="${AMBER}" stroke-width="4"/>`;
  }

  const marker = point
    ? `<g transform="translate(${px(point)}) scale(0.7)">
        <path d="M0 0 c-6 -16 -20 -24 -20 -40 a20 20 0 1 1 40 0 c0 16 -14 24 -20 40z" fill="#d92d20" stroke="#fff" stroke-width="3"/>
        <circle cx="0" cy="-40" r="7" fill="#fff"/>
      </g>`
    : "";

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" font-family="Helvetica, Arial, sans-serif">
      ${area}
      ${marker}
      <rect x="${sx - 10}" y="${sy - 30}" width="${Math.max(barPx, 70) + 20}" height="44" rx="4" fill="#fff" opacity="0.9"/>
      <path d="M${sx} ${sy - 8} v8 h${barPx} v-8" fill="none" stroke="#111" stroke-width="3"/>
      <text x="${sx + barPx / 2}" y="${sy - 10}" text-anchor="middle" font-size="18" fill="#111">${barM >= 1000 ? `${barM / 1000} km` : `${barM} m`}</text>
      <rect x="${MAP_WIDTH - 318}" y="${MAP_HEIGHT - 38}" width="308" height="28" rx="4" fill="#fff" opacity="0.9"/>
      <text x="${MAP_WIDTH - 20}" y="${MAP_HEIGHT - 18}" text-anchor="end" font-size="16" fill="#333">Kilde: Danmarks Arealinformation</text>
    </svg>`,
  );
}

/**
 * Danner et PNG-kort over beskyttede naturområder omkring en lokation. Med en grund tegnes grundens grænser og
 * en buffer om dem; ellers en cirkel om punktet (WGS84). Mindst ét af punkt og grund skal være angivet.
 * Returnerer null, hvis Arealinformation ikke svarer. Baggrundskort og signaturforklaring udelades, hvis de ikke kan hentes.
 */
export async function renderAreaMap(input: { latitude: number | null; longitude: number | null; parcel?: Parcel | null }): Promise<{ data: Buffer; hasBackground: boolean } | null> {
  const parcel = input.parcel ?? null;
  const point = input.latitude !== null && input.longitude !== null ? wgs84ToUtm32(input.latitude, input.longitude) : null;
  if (!point && !parcel) return null;
  const view = mapView(point ?? [0, 0], parcel);
  const { bbox } = view;
  const [layers, background, legends] = await Promise.all([getMap(WMS_URL, AREA_LAYERS.join(","), bbox), fetchBackground(bbox), loadLegends().catch(() => [])]);
  if (!layers) return null;

  const pad = 12;
  const legendW = Math.max(0, ...legends.map((l) => l.width)) + pad * 2;
  const legendH = legends.reduce((h, l) => h + l.height + 4, 0) + pad * 2;
  let top = pad + 16;
  const legendParts = legends.map((l) => {
    const part = { input: l.data, left: MAP_WIDTH - legendW - 16 + pad, top };
    top += l.height + 4;
    return part;
  });

  const base = background ? sharp(background).resize(MAP_WIDTH, MAP_HEIGHT, { fit: "fill" }) : sharp({ create: { width: MAP_WIDTH, height: MAP_HEIGHT, channels: 3, background: "#ffffff" } });
  const data = await base
    .composite([
      { input: layers, left: 0, top: 0 },
      { input: overlaySvg(view, point, parcel), left: 0, top: 0 },
      ...(legends.length
        ? [
            {
              input: await sharp({ create: { width: legendW, height: legendH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer(),
              left: MAP_WIDTH - legendW - 16,
              top: 16,
            },
            ...legendParts,
          ]
        : []),
    ])
    .png()
    .toBuffer();
  return { data, hasBackground: !!background };
}
