/**
 * Oprydning i Erhvervsstyrelsens skabelon, så den kan bruges som færdig rapport:
 * vejledningsbokse fjernes, indholdet rykkes op, og højre kolonne (hvor vejledningen stod)
 * bliver fri til rapportens egen kommentar – eller tabellerne udvides til fuld bredde.
 */
import { EMU_PER_INCH, NS, children, first, frame, removeShape, shapeText, shapes, tables, textOf, type Slide, type Table } from "./pptx/ooxml";

type Element = ReturnType<typeof children>[number];
export type Box = { x: number; y: number; w: number; h: number };

export const inch = (v: number) => Math.round(v * EMU_PER_INCH);

/** Slidens indholdsområde (13,33 × 7,5 tommer) */
export const LEFT = inch(0.57);
export const RIGHT_EDGE = inch(12.77);
export const CONTENT_TOP = inch(1.11);
export const SLIDE_BOTTOM = inch(7.0);
/** Alt til venstre for denne linje hører til venstre kolonne */
const COLUMN_SPLIT = inch(8.7);

/** Tekster, der indleder vejledning til den, der udfylder skabelonen */
export const GUIDANCE = /^\s*(Oplysningspunktet (skal|er)|Begrebsforklaringer|Mulige datakilder|Vejledning til udfyldelse|Du kan desuden vælge|Overvej, om)/;

const placeholderType = (s: Element) => first(s, NS.p, "ph")?.getAttribute("type") ?? null;
/** Titel, sidehoved (firmanavn), sidetal og dato */
const isChrome = (s: Element) => {
  const t = placeholderType(s);
  if (t === "title" || t === "ftr" || t === "sldNum" || t === "dt") return true;
  const f = frame(s);
  return !!f && f.y < inch(0.5);
};

const inside = (f: Box, box: Box, tol = inch(0.05)) => f.x >= box.x - tol && f.y >= box.y - tol && f.x + f.w <= box.x + box.w + tol && f.y + f.h <= box.y + box.h + tol;

/** Fjerner vejledningsbokse og alt, der ligger inden i dem (ikoner, formel-tabeller). Returnerer antal fjernede bokse. */
export function stripGuidance(slide: Slide): number {
  const boxes = shapes(slide).filter((s) => s.localName === "sp" && !placeholderType(s) && GUIDANCE.test(shapeText(s)));
  for (const box of boxes) {
    const b = frame(box);
    if (b) {
      for (const s of shapes(slide)) {
        if (s === box || isChrome(s)) continue;
        const f = frame(s);
        if (f && inside(f, b)) removeShape(s);
      }
    }
    removeShape(box);
  }
  // Løse ikoner i højre kolonne (punkttegn fra "Mulige datakilder")
  for (const s of shapes(slide)) {
    const f = frame(s);
    if (s.localName === "pic" && f && f.x >= COLUMN_SPLIT && f.w < inch(0.4)) removeShape(s);
  }
  return boxes.length;
}

/** Skønnet rækkehøjde ud fra tekstmængde (9 pkt. ≈ 15 tegn pr. tomme, 0,17" pr. linje) */
export function estimateRowHeight(tr: Element, colWidths: number[]): number {
  const declared = Number(tr.getAttribute("h") ?? 0);
  // Flettede celler (gridSpan) får bredden af alle de kolonner, de dækker
  const lines = children(tr, NS.a, "tc").map((tc, i) => {
    if (tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1") return 1;
    const span = Number(tc.getAttribute("gridSpan") ?? 1);
    const w = colWidths.slice(i, i + span).reduce((s, x) => s + x, 0) / EMU_PER_INCH || 2;
    const perLine = Math.max(8, Math.floor(w * 15));
    return textOf(tc)
      .split("\n")
      .reduce((s, l) => s + Math.max(1, Math.ceil(l.length / perLine)), 0);
  });
  return Math.max(declared, inch(0.08) + Math.max(1, ...lines) * inch(0.17));
}

export const gridWidths = (t: Table) => children(first(t.tbl, NS.a, "tblGrid")!, NS.a, "gridCol").map((c) => Number(c.getAttribute("w")));

/** Tabellens forventede højde, når teksten er brudt om (med 10 % luft, da skønnet er groft) */
export function tableHeight(t: Table): number {
  const widths = gridWidths(t);
  return Math.round(t.rows.reduce((s, tr) => s + estimateRowHeight(tr, widths), 0) * 1.1);
}

const setXfrm = (shape: Element, box: Partial<Box>) => {
  const xfrm = first(shape, NS.a, "xfrm") ?? first(shape, NS.p, "xfrm");
  if (!xfrm) return;
  const off = first(xfrm, NS.a, "off");
  const ext = first(xfrm, NS.a, "ext");
  if (off && box.x !== undefined) off.setAttribute("x", String(Math.round(box.x)));
  if (off && box.y !== undefined) off.setAttribute("y", String(Math.round(box.y)));
  if (ext && box.w !== undefined) ext.setAttribute("cx", String(Math.round(box.w)));
  if (ext && box.h !== undefined) ext.setAttribute("cy", String(Math.round(box.h)));
};

/** Indholdet i venstre kolonne (tabeller, tekstbokse, billeder) – ikke titel, sidehoved og sidetal */
function leftContent(slide: Slide) {
  return shapes(slide)
    .filter((s) => !isChrome(s))
    .map((s) => ({ s, f: frame(s) }))
    .filter((x): x is { s: Element; f: Box } => !!x.f && x.f.x < COLUMN_SPLIT)
    .sort((a, b) => a.f.y - b.f.y || a.f.x - b.f.x);
}

/**
 * Rykker venstre kolonnes indhold op, så hullerne efter vejledningen forsvinder.
 * Figurer flyttes kun opad, så en side, der passede før, stadig passer.
 */
export function compact(slide: Slide, gap = inch(0.25)) {
  let cursor = CONTENT_TOP;
  for (const { s, f } of leftContent(slide)) {
    const t = tables(slide).find((x) => x.frame === s);
    const h = t ? Math.max(f.h, tableHeight(t)) : f.h;
    const y = Math.min(f.y, cursor);
    if (y !== f.y) setXfrm(s, { y });
    cursor = y + h + gap;
  }
}

/** Bunden af venstre kolonnes indhold (EMU) */
export function contentBottom(slide: Slide): number {
  return leftContent(slide).reduce((m, { s, f }) => {
    const t = tables(slide).find((x) => x.frame === s);
    return Math.max(m, f.y + (t ? Math.max(f.h, tableHeight(t)) : f.h));
  }, CONTENT_TOP);
}

/** Udvider tabellerne i venstre kolonne til fuld bredde (kolonnerne skaleres forholdsmæssigt) */
export function widenTables(slide: Slide) {
  for (const t of tables(slide)) {
    const f = frame(t.frame);
    if (!f || f.x >= COLUMN_SPLIT) continue;
    const target = RIGHT_EDGE - f.x;
    if (target <= f.w) continue;
    const cols = children(first(t.tbl, NS.a, "tblGrid")!, NS.a, "gridCol");
    const total = cols.reduce((s, c) => s + Number(c.getAttribute("w")), 0) || f.w;
    let used = 0;
    cols.forEach((c, i) => {
      const w = i === cols.length - 1 ? target - used : Math.round((Number(c.getAttribute("w")) / total) * target);
      c.setAttribute("w", String(w));
      used += w;
    });
    setXfrm(t.frame, { w: target });
  }
  // Øvrige figurer i venstre kolonne med samme bredde som tabellerne (fx tekstfelter) følger med
  for (const { s, f } of leftContent(slide)) {
    if (s.localName === "sp" && f.w > inch(7.5) && f.x + f.w < COLUMN_SPLIT + inch(0.3)) setXfrm(s, { w: RIGHT_EDGE - f.x });
  }
}

/** Den frie højre kolonne: fra venstre kolonnes højre kant (+ luft) til slidens højre margen */
export function freeRightColumn(slide: Slide): Box {
  const right = leftContent(slide).reduce((m, { f }) => Math.max(m, f.x + f.w), LEFT + inch(8));
  const x = right + inch(0.3);
  return { x, y: CONTENT_TOP, w: Math.max(0, RIGHT_EDGE - x), h: SLIDE_BOTTOM - CONTENT_TOP };
}

