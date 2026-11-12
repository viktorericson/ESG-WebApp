/**
 * Rapportens tekster og billedpladser (Report.content og ReportImage.slot).
 *
 * Teksterne skrives pr. rapport – ikke i modulerne – så de også passer til konsoliderede
 * rapporter. Alt er valgfrit: en tom tekst betyder, at siden/kommentaren udelades i eksporten.
 * Filen bruges både i browseren (redigering) og på serveren (validering, eksport).
 */
import { z } from "zod";

/** Én kommentar pr. slide i skabelonen. `c: true` = kun i Udvidet Modul. */
export const SECTIONS = [
  { key: "b1", label: "B1 – Grundlag for udarbejdelse" },
  { key: "b1Figures", label: "B1 – Nøgletal og udeladelser" },
  { key: "b1Locations", label: "B1 – Lokationer og certificeringer" },
  { key: "b2", label: "B2 – Indsatser, politikker og initiativer" },
  { key: "b3Energy", label: "B3 – Energiforbrug" },
  { key: "b3Ghg", label: "B3 – CO₂e-udledning (scope 1 og 2)" },
  { key: "scope3", label: "B3 – CO₂e-udledning i scope 3" },
  { key: "b4", label: "B4 – Forurening af luft, vand og jord" },
  { key: "b5", label: "B5 – Biodiversitet" },
  { key: "b6", label: "B6 – Vand" },
  { key: "b7Circular", label: "B7 – Cirkulær økonomi" },
  { key: "b7Waste", label: "B7 – Affald" },
  { key: "b7Materials", label: "B7 – Materialer" },
  { key: "b8", label: "B8 – Egen arbejdsstyrke" },
  { key: "b8Countries", label: "B8 – Ansatte pr. land" },
  { key: "b9", label: "B9 – Sundhed og sikkerhed" },
  { key: "b10", label: "B10 – Mindsteløn og lønforskel" },
  { key: "b10b", label: "B10 – Overenskomst og uddannelse" },
  { key: "b11", label: "B11 – Korruption og bestikkelse" },
  { key: "c1", label: "C1 – Strategi og forretningsmodel", c: true },
  { key: "c2", label: "C2 – Beskrivelse af indsatser og politikker", c: true },
  { key: "c3", label: "C3 – Reduktionsmål", c: true },
  { key: "c3Transition", label: "C3 – Klimaomstilling", c: true },
  { key: "c4", label: "C4 – Klimarisici", c: true },
  { key: "c5", label: "C5 – Supplerende oplysninger om arbejdsstyrken", c: true },
  { key: "c6", label: "C6 – Menneskerettighedspolitikker", c: true },
  { key: "c7", label: "C7 – Menneskerettighedshændelser", c: true },
  { key: "c8", label: "C8 – Indtægter fra bestemte aktiviteter", c: true },
  { key: "c9", label: "C9 – Kønsfordeling i ledelsen", c: true },
] as const satisfies readonly { key: string; label: string; c?: boolean }[];

export type SectionKey = (typeof SECTIONS)[number]["key"];
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as [SectionKey, ...SectionKey[]];

export const MAX_TEXT = 6000;
export const MAX_SECTION_TEXT = 3000;
export const MAX_SUMMARY_TEXT = 600;

const text = (max: number) => z.string().max(max, `Højst ${max.toLocaleString("da-DK")} tegn`).optional();

export const reportContentSchema = z.object({
  foreword: text(MAX_TEXT),
  about: text(MAX_TEXT),
  summary: z
    .object({
      show: z.boolean().default(true),
      environment: text(MAX_SUMMARY_TEXT),
      social: text(MAX_SUMMARY_TEXT),
      governance: text(MAX_SUMMARY_TEXT),
    })
    .optional(),
  sections: z.partialRecord(z.enum(SECTION_KEYS), z.string().max(MAX_SECTION_TEXT, `Højst ${MAX_SECTION_TEXT.toLocaleString("da-DK")} tegn`)).optional(),
  closing: text(MAX_TEXT),
});

export type ReportContent = z.infer<typeof reportContentSchema>;

/** Læser lagret indhold tolerant: ukendte nøgler og ugyldige værdier ignoreres */
export function readContent(json: unknown): ReportContent {
  const parsed = reportContentSchema.safeParse(json ?? {});
  return parsed.success ? parsed.data : {};
}

/** Fjerner tomme tekster, så "udfyldt" altid betyder, at der står noget */
export function compactContent(c: ReportContent): ReportContent {
  const t = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  const sections = Object.fromEntries(Object.entries(c.sections ?? {}).flatMap(([k, v]) => (t(v) ? [[k, t(v)]] : [])));
  return {
    foreword: t(c.foreword),
    about: t(c.about),
    summary: c.summary ? { show: c.summary.show, environment: t(c.summary.environment), social: t(c.summary.social), governance: t(c.summary.governance) } : undefined,
    sections: Object.keys(sections).length ? sections : undefined,
    closing: t(c.closing),
  };
}

/** Ledelsesoversigten er med, medmindre den er slået fra */
export const showSummary = (c: ReportContent) => c.summary?.show !== false;

/* ------------------------------------------------------------------ */
/* Billeder                                                            */
/* ------------------------------------------------------------------ */

export const IMAGE_SLOTS = ["foreword", "about", "appendix", ...SECTION_KEYS.map((k) => `section:${k}` as const)] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];
export const isImageSlot = (v: string): v is ImageSlot => (IMAGE_SLOTS as readonly string[]).includes(v);

/** Højst så mange billeder pr. plads (forord 1, kernefortælling 2, afsnit 4, bilag 20) */
export const IMAGE_LIMITS: Record<string, number> = { foreword: 1, about: 2, appendix: 20 };
export const imageLimit = (slot: string) => IMAGE_LIMITS[slot] ?? 4;

export function slotLabel(slot: string): string {
  if (slot === "foreword") return "Forord";
  if (slot === "about") return "Om virksomheden";
  if (slot === "appendix") return "Bilag";
  const key = slot.replace(/^section:/, "");
  return SECTIONS.find((s) => s.key === key)?.label ?? slot;
}
