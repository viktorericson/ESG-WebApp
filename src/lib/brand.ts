/**
 * Rapportfarve: kundens farve erstatter skabelonens mørkegrønne. Lysere toner til baggrunde og
 * tabelrækker afledes automatisk, så hele decket følger farven. Rene funktioner (klient og server).
 */

/** Skabelonens mørkegrønne grundfarve */
export const TEMPLATE_DARK = "1B4528";

/**
 * Alle grønne toner, skabelonen bruger (tema, layouts og hårdkodede farver i slides).
 * Hver tone erstattes af kundens farve blandet med hvid i samme forhold som i skabelonen.
 */
export const TEMPLATE_GREENS = ["1B4528", "1B4529", "32583E", "52715B", "5F7D69", "8DA294", "BBC7BF", "D1DAD4", "E8ECEA"] as const;

export const normalizeHex = (v: string): string | null => {
  const m = v.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(m)) return m;
  if (/^[0-9A-F]{3}$/.test(m)) return m.split("").map((c) => c + c).join("");
  return null;
};

const channels = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** Blander farven med hvid; amount 0 = farven, 1 = hvid */
export const tint = (hex: string, amount: number) => toHex(channels(hex).map((c) => c + (255 - c) * amount));

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG-kontrast mod hvid tekst */
export const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

/** Hvid tekst skal kunne læses på farven (overskrifter i tabeller, bokse og forsidetekst) */
export const MIN_CONTRAST = 4.5;

/** Hvor meget en tone er blandet med hvid i forhold til skabelonens mørkegrønne (0 = samme, 1 = hvid) */
export function tintAmount(tone: string, base = TEMPLATE_DARK): number {
  const b = channels(base);
  const t = channels(tone);
  const amounts = t.map((c, i) => (255 - b[i] === 0 ? 0 : (c - b[i]) / (255 - b[i])));
  return Math.min(1, Math.max(0, amounts.reduce((s, a) => s + a, 0) / amounts.length));
}

/** Skabelonens toner → kundens */
export function brandPalette(hex: string): Record<string, string> {
  return Object.fromEntries(TEMPLATE_GREENS.map((g) => [g, tint(hex, tintAmount(g))]));
}
