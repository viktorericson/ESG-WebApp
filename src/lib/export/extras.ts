/**
 * Valgfrie ekstra sider i rapporten: forord, kernefortælling, ledelsesoversigt, kommentarer,
 * billedsider og bilag. Siderne laves som kopier af en indholdsslide fra skabelonen, hvor kun
 * titel, sidehoved og sidetal bevares – så de får præcis samme udseende som resten.
 *
 * Farver angives med skabelonens grønne toner, så de følger med, når kundens farve sættes ind.
 */
import { type Box, CONTENT_TOP, LEFT, RIGHT_EDGE, SLIDE_BOTTOM, inch } from "./cleanup";
import { EMU_PER_INCH, NS, Pptx, descendants, first, parse, removeShape, setParagraphText, shapes, type Slide } from "./pptx/ooxml";
import { parseRich, type Run } from "../rich-text";
import { formatChange, isImprovement, type Summary } from "../summary";

type Element = NonNullable<ReturnType<typeof first>>;

export type Picture = { data: Uint8Array; ext: "png" | "jpeg"; width: number; height: number; caption?: string | null };

const DARK = "1B4528";
const TILE = "E8ECEA";
const GOOD = "00A65A";
const BAD = "B45309";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ------------------------------------------------------------------ */
/* Tekst                                                               */
/* ------------------------------------------------------------------ */

/**
 * Et afsnit i en tekstboks. `runs` bærer formateringen fra editoren (fed, kursiv, understreget);
 * uden runs skrives `text` med boksens stil. `number` er nummeret i en nummereret liste.
 */
export type Paragraph = { text: string; bullet?: boolean; bold?: boolean; heading?: boolean; number?: number; runs?: Run[] };

/**
 * Formateret tekst fra rapportindholdet → afsnit (se lib/rich-text): overskrifter, punkter,
 * nummererede lister og fed/kursiv/understreget. Almindelig tekst giver almindelige afsnit.
 */
export function paragraphs(text: string): Paragraph[] {
  let n = 0;
  return parseRich(text).map((b) => {
    n = b.type === "ordered" ? n + 1 : 0;
    const p: Paragraph = { text: b.runs.map((r) => r.text).join(""), runs: b.runs };
    if (b.type === "bullet") p.bullet = true;
    if (b.type === "ordered") p.number = n;
    if (b.type === "heading") p.heading = true;
    return p;
  });
}

/** Skønnet antal linjer ved en given bredde (tommer) og skriftstørrelse (pt) */
function linesFor(p: Paragraph, widthIn: number, sizePt: number) {
  const charsPerLine = Math.max(10, Math.floor((widthIn - (p.bullet || p.number ? 0.25 : 0)) * 72 / (sizePt * 0.5)));
  return Math.max(1, Math.ceil(p.text.length / charsPerLine));
}

/** Skønnet højde (EMU) af afsnittene: linjehøjde 1,25 × skriften + 6 pt efter hvert afsnit */
export function textHeight(ps: Paragraph[], widthIn: number, sizePt = 11): number {
  const pt = ps.reduce((s, p) => s + linesFor(p, widthIn, sizePt) * sizePt * 1.25 + 6, 0);
  return Math.round((pt / 72) * EMU_PER_INCH) + inch(0.2);
}

/** Deler afsnittene i sider, der hver kan være i en boks af den givne højde. Lange afsnit deles ikke. */
export function paginateText(ps: Paragraph[], widthIn: number, heightEmu: number, sizePt = 11): Paragraph[][] {
  const pages: Paragraph[][] = [];
  let cur: Paragraph[] = [];
  for (const p of ps) {
    if (cur.length && textHeight([...cur, p], widthIn, sizePt) > heightEmu) {
      pages.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) pages.push(cur);
  return pages;
}

function nextShapeId(doc: Slide["doc"]) {
  return Math.max(0, ...descendants(doc, NS.p, "cNvPr").map((c) => Number(c.getAttribute("id")) || 0)) + 1;
}

function append(slide: Slide, xml: string) {
  const tree = first(slide.doc, NS.p, "spTree")!;
  const el = parse(xml).documentElement!;
  return tree.appendChild(slide.doc.importNode(el, true));
}

type TextStyle = { size?: number; color?: string; bold?: boolean; fill?: string; inset?: number; columns?: number; anchor?: "t" | "ctr" | "b"; align?: "l" | "ctr" | "r" };

function runXml(text: string, size: number, color: string, bold: boolean, italic = false, underline = false) {
  return `<a:r><a:rPr lang="da-DK" sz="${size * 100}" b="${bold ? 1 : 0}" i="${italic ? 1 : 0}"${underline ? ' u="sng"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t xml:space="preserve">${esc(text)}</a:t></a:r>`;
}

function paragraphXml(p: Paragraph, s: Required<Pick<TextStyle, "size" | "color" | "bold" | "align">>) {
  const after = p.heading ? 300 : 600;
  const before = p.heading ? '<a:spcBef><a:spcPts val="600"/></a:spcBef>' : "";
  const pPr = p.bullet
    ? `<a:pPr marL="228600" indent="-228600" algn="${s.align}"><a:spcAft><a:spcPts val="${after}"/></a:spcAft><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>`
    : p.number
      ? // startAt, så nummereringen fortsætter korrekt, når en liste deles over flere sider
        `<a:pPr marL="228600" indent="-228600" algn="${s.align}"><a:spcAft><a:spcPts val="${after}"/></a:spcAft><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod" startAt="${p.number}"/></a:pPr>`
      : `<a:pPr algn="${s.align}">${before}<a:spcAft><a:spcPts val="${after}"/></a:spcAft><a:buNone/></a:pPr>`;
  // Overskrifter står fed og lidt større i skabelonens mørkegrønne tekstfarve
  const size = p.heading ? s.size + 2 : s.size;
  const color = p.heading ? DARK : s.color;
  const baseBold = p.heading || (p.bold ?? s.bold);
  const runs = p.runs?.length ? p.runs : [{ text: p.text }];
  return `<a:p>${pPr}${runs.map((r) => runXml(r.text, size, color, baseBold || !!r.bold, !!r.italic, !!r.underline)).join("")}</a:p>`;
}

/** Tekstboks med afsnit. Krymper teksten, hvis den alligevel ikke kan være der. */
export function addText(slide: Slide, box: Box, ps: Paragraph[], style: TextStyle = {}) {
  const s = { size: style.size ?? 11, color: style.color ?? "000000", bold: style.bold ?? false, align: style.align ?? "l" };
  const inset = style.inset ?? inch(0.05);
  const fill = style.fill ? `<a:solidFill><a:srgbClr val="${style.fill}"/></a:solidFill>` : "<a:noFill/>";
  const cols = style.columns && style.columns > 1 ? ` numCol="${style.columns}" spcCol="${inch(0.4)}"` : "";
  const body = (ps.length ? ps : [{ text: "" }]).map((p) => paragraphXml(p, s)).join("");
  const id = nextShapeId(slide.doc);
  return append(
    slide,
    `<p:sp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvSpPr><p:cNvPr id="${id}" name="Tekst ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" anchor="${style.anchor ?? "t"}"${cols} rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`,
  );
}

/** Rektangel med fyld (til nøgletalsbokse og overskriftsbjælker) */
function addRect(slide: Slide, box: Box, fill: string) {
  const id = nextShapeId(slide.doc);
  return append(
    slide,
    `<p:sp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvSpPr><p:cNvPr id="${id}" name="Boks ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="da-DK"/></a:p></p:txBody></p:sp>`,
  );
}

/* ------------------------------------------------------------------ */
/* Billeder                                                            */
/* ------------------------------------------------------------------ */

/** Placerer billedet inden for boksen med bevaret format (centreret). Returnerer billedets ramme. */
export async function addPicture(pptx: Pptx, slide: Slide, pic: Picture, box: Box, name = "Billede"): Promise<Box> {
  const ratio = pic.width / pic.height;
  let w = box.w;
  let h = w / ratio;
  if (h > box.h) {
    h = box.h;
    w = h * ratio;
  }
  const placed = { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
  const rId = await pptx.addImage(slide, pic.data, pic.ext);
  const id = nextShapeId(slide.doc);
  append(
    slide,
    `<p:pic xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}" descr="${esc(pic.caption ?? name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round(placed.x)}" y="${Math.round(placed.y)}"/><a:ext cx="${Math.round(placed.w)}" cy="${Math.round(placed.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
  );
  return placed;
}

/** Billede med billedtekst under, inden for boksen */
async function addCaptioned(pptx: Pptx, slide: Slide, pic: Picture, box: Box) {
  const captionH = pic.caption ? inch(0.35) : 0;
  const placed = await addPicture(pptx, slide, pic, { ...box, h: box.h - captionH });
  if (pic.caption) addText(slide, { x: box.x, y: placed.y + placed.h + inch(0.05), w: box.w, h: captionH }, [{ text: pic.caption }], { size: 9, color: "555555", align: "ctr" });
}

/**
 * Udskifter forsidens baggrundsbillede med kundens foto. Billedet er baggrunden i forsidens layout
 * (skabelonens "ESG"-bogstaver ligger ovenpå i samme layout), så det er dér, det skal skiftes.
 * Fotoet beskæres, så det dækker siden uden at blive forvrænget. Returnerer false, hvis layoutet
 * ikke har en billedbaggrund.
 */
export async function setCoverPhoto(pptx: Pptx, slide: Slide, pic: Picture, size: { w: number; h: number }): Promise<boolean> {
  const layout = await pptx.layoutOf(slide);
  if (!layout) return false;
  const slideRatio = size.w / size.h;
  const ratio = pic.width / pic.height;
  // Beskæring i 1/1000 procent af billedet (srcRect)
  const crop = ratio > slideRatio ? { lr: Math.round(((1 - slideRatio / ratio) / 2) * 100000), tb: 0 } : { lr: 0, tb: Math.round(((1 - ratio / slideRatio) / 2) * 100000) };
  const rId = await pptx.addImage({ path: layout }, pic.data, pic.ext);
  let done = false;
  await pptx.editXml(layout, (doc) => {
    const bg = first(doc, NS.p, "bg");
    const fill = bg && first(bg, NS.a, "blipFill");
    const blip = fill && first(fill, NS.a, "blip");
    if (!fill || !blip) return;
    blip.setAttributeNS(NS.r, "r:embed", rId);
    const old = first(fill, NS.a, "srcRect");
    const rect = doc.createElementNS(NS.a, "a:srcRect");
    rect.setAttribute("l", String(crop.lr));
    rect.setAttribute("r", String(crop.lr));
    rect.setAttribute("t", String(crop.tb));
    rect.setAttribute("b", String(crop.tb));
    if (old) fill.replaceChild(rect, old);
    else fill.insertBefore(rect, blip.nextSibling);
    done = true;
  });
  return done;
}

/* ------------------------------------------------------------------ */
/* Sider                                                               */
/* ------------------------------------------------------------------ */

/**
 * Tom indholdsside: kopi af `source` med kun titel, sidehoved og sidetal.
 * Kopien får templateNo -1, så den aldrig forveksles med skabelonens egne slides.
 */
export async function blankSlide(pptx: Pptx, source: Slide, after: Slide, title: string): Promise<Slide> {
  const slide = await pptx.duplicate(source, after);
  slide.templateNo = -1;
  for (const s of shapes(slide)) {
    const type = first(s, NS.p, "ph")?.getAttribute("type");
    if (type === "title") {
      const ps = descendants(s, NS.a, "p");
      ps.slice(1).forEach((p) => p.parentNode!.removeChild(p));
      setParagraphText(ps[0], title);
      continue;
    }
    if (type === "ftr" || type === "sldNum" || type === "dt") continue;
    removeShape(s);
  }
  return slide;
}

const TEXT_AREA: Box = { x: LEFT, y: CONTENT_TOP + inch(0.1), w: RIGHT_EDGE - LEFT, h: SLIDE_BOTTOM - CONTENT_TOP - inch(0.1) };
const toIn = (emu: number) => emu / EMU_PER_INCH;

/**
 * Tekstside(r) med valgfrie billeder i højre side. Uden billeder sættes teksten i to spalter.
 * Fortsætter på "– fortsat"-sider, hvis teksten er lang. Returnerer den sidste side.
 */
export async function textPages(pptx: Pptx, source: Slide, after: Slide, title: string, text: string, pictures: Picture[] = []): Promise<Slide> {
  const ps = paragraphs(text);
  if (!ps.length && !pictures.length) return after;
  const withPics = pictures.length > 0;
  const textBox: Box = withPics ? { ...TEXT_AREA, w: inch(7.4) } : TEXT_AREA;
  const cols = withPics ? 1 : 2;
  // Ved to spalter regnes kapaciteten som én spalte af den dobbelte højde
  const colWidth = cols === 2 ? (toIn(textBox.w) - 0.4) / 2 : toIn(textBox.w);
  const size = 12;
  const pages = paginateText(ps, colWidth, textBox.h * cols - inch(0.2), size);
  let last = after;
  for (const [i, page] of (pages.length ? pages : [[]]).entries()) {
    const slide = await blankSlide(pptx, source, last, i === 0 ? title : `${title} – fortsat`);
    // Fylder en kort tekst kun lidt, bruges én spalte, så linjerne ikke bliver halvtomme
    const short = cols === 2 && textHeight(page, toIn(inch(8.4)), size) < textBox.h * 0.85;
    addText(slide, short ? { ...textBox, w: inch(8.4) } : textBox, page, { columns: short ? 1 : cols, size });
    if (i === 0 && withPics) {
      const area: Box = { x: textBox.x + textBox.w + inch(0.4), y: textBox.y, w: RIGHT_EDGE - (textBox.x + textBox.w + inch(0.4)), h: textBox.h };
      const each = (area.h - inch(0.2) * (pictures.length - 1)) / pictures.length;
      for (const [j, pic] of pictures.entries()) await addCaptioned(pptx, slide, pic, { ...area, y: area.y + j * (each + inch(0.2)), h: each });
    }
    last = slide;
  }
  return last;
}

/** Billedside(r): 1 billede fylder siden, 2 står side om side, 3–4 i et gitter */
export async function picturePages(pptx: Pptx, source: Slide, after: Slide, title: string, pictures: Picture[]): Promise<Slide> {
  let last = after;
  for (let i = 0; i < pictures.length; i += 4) {
    const group = pictures.slice(i, i + 4);
    const slide = await blankSlide(pptx, source, last, i === 0 ? title : `${title} – fortsat`);
    const area = TEXT_AREA;
    const gap = inch(0.3);
    const cols = group.length === 1 ? 1 : 2;
    const rows = group.length > 2 ? 2 : 1;
    const w = (area.w - gap * (cols - 1)) / cols;
    const h = (area.h - gap * (rows - 1)) / rows;
    for (const [j, pic] of group.entries()) {
      await addCaptioned(pptx, slide, pic, { x: area.x + (j % cols) * (w + gap), y: area.y + Math.floor(j / cols) * (h + gap), w, h });
    }
    last = slide;
  }
  return last;
}

/** Bilag: ét billede pr. side med billedteksten som titel */
export async function appendixPages(pptx: Pptx, source: Slide, after: Slide, pictures: Picture[]): Promise<Slide> {
  let last = after;
  for (const [i, pic] of pictures.entries()) {
    const slide = await blankSlide(pptx, source, last, pic.caption?.trim() || `Bilag ${i + 1}`);
    await addPicture(pptx, slide, pic, TEXT_AREA, pic.caption ?? `Bilag ${i + 1}`);
    last = slide;
  }
  return last;
}

/**
 * Ledelsesoversigt: tre spalter (miljø, socialt, ledelse) med nøgletalsbokse og udviklingen
 * siden sidste år, og en kommentarboks nederst, hvis der er kommentarer.
 */
export async function summaryPage(
  pptx: Pptx,
  source: Slide,
  after: Slide,
  summary: Summary,
  comments: { environment?: string; social?: string; governance?: string },
): Promise<Slide> {
  const slide = await blankSlide(pptx, source, after, `Ledelsesoversigt ${summary.year}`);
  const commentLines = summary.columns
    .map((c) => ({ title: c.title, text: comments[c.key]?.trim() }))
    .filter((c): c is { title: string; text: string } => !!c.text);
  const gap = inch(0.3);
  const colW = (RIGHT_EDGE - LEFT - gap * 2) / 3;
  const headerH = inch(0.42);
  const top = CONTENT_TOP + inch(0.05);
  const tilesBottom = commentLines.length ? inch(4.55) : SLIDE_BOTTOM - inch(0.3);

  for (const [i, col] of summary.columns.entries()) {
    const x = LEFT + i * (colW + gap);
    addRect(slide, { x, y: top, w: colW, h: headerH }, DARK);
    addText(slide, { x, y: top, w: colW, h: headerH }, [{ text: col.title }], { size: 14, color: "FFFFFF", bold: true, anchor: "ctr", align: "ctr" });
    const tGap = inch(0.15);
    const tileCols = 2;
    const tileRows = Math.ceil(col.tiles.length / tileCols);
    const tileW = (colW - tGap) / tileCols;
    const tileH = Math.min(inch(1.3), (tilesBottom - (top + headerH + tGap) - tGap * (tileRows - 1)) / tileRows);
    for (const [j, t] of col.tiles.entries()) {
      const box = { x: x + (j % tileCols) * (tileW + tGap), y: top + headerH + tGap + Math.floor(j / tileCols) * (tileH + tGap), w: tileW, h: tileH };
      addRect(slide, box, TILE);
      const change = formatChange(t.change, t.changeUnit);
      const better = isImprovement(t);
      const ps: Paragraph[] = [{ text: t.label }];
      addText(slide, { ...box, h: inch(0.4) }, ps, { size: 10, color: "333333", inset: inch(0.1) });
      addText(slide, { x: box.x, y: box.y + inch(0.35), w: box.w, h: inch(0.5) }, [{ text: t.value }], { size: 16, bold: true, color: DARK, inset: inch(0.1) });
      if (change && summary.previousYear) {
        addText(slide, { x: box.x, y: box.y + box.h - inch(0.36), w: box.w, h: inch(0.32) }, [{ text: `${change} ift. ${summary.previousYear}` }], {
          size: 9,
          color: better === true ? GOOD : better === false ? BAD : "555555",
          bold: better !== null,
          inset: inch(0.1),
        });
      }
    }
  }

  if (commentLines.length) {
    const ps = commentLines.flatMap((c) => [{ text: `${c.title}: ${c.text}` }]);
    const maxH = SLIDE_BOTTOM - tilesBottom - inch(0.25);
    const box = { x: LEFT, y: tilesBottom + inch(0.25), w: RIGHT_EDGE - LEFT, h: Math.min(maxH, textHeight(ps, toIn(RIGHT_EDGE - LEFT) - 0.4, 10) + inch(0.3)) };
    addRect(slide, box, DARK);
    const shape = addText(slide, box, ps, { size: 10, color: "FFFFFF", inset: inch(0.15) });
    // Spaltens navn fed foran kommentaren
    for (const [k, p] of descendants(shape as Element, NS.a, "p").entries()) {
      const r = first(p, NS.a, "r");
      const t = r && first(r, NS.a, "t");
      if (!r || !t) continue;
      const head = `${commentLines[k].title}: `;
      t.textContent = (t.textContent ?? "").slice(head.length);
      const bold = r.cloneNode(true) as Element;
      first(bold, NS.a, "rPr")!.setAttribute("b", "1");
      first(bold, NS.a, "t")!.textContent = head;
      p.insertBefore(bold, r);
    }
  }
  return slide;
}

/** Tekst i en boks på en eksisterende side (afsnitskommentar i højre kolonne) */
export function addComment(slide: Slide, box: Box, text: string) {
  addText(slide, box, paragraphs(text), { size: 10 });
}

