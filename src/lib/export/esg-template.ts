/**
 * Udfylder Erhvervsstyrelsens ESG-skabelon (templates/esg_skabelon_dansk.pptx, version 3.3)
 * med eksportmodellen.
 *
 * Skabelonens layout bevares. Vejledningsslides (1–4) fjernes, pladsholdere udfyldes,
 * tabeller får én række pr. element, og slides for punkter, der ikke er relevante,
 * fjernes, som skabelonen selv anviser. Lange tabeller fortsætter på en kopi af sliden.
 */
import type { ExportModel } from "./model";
import { brandPalette } from "../brand";
import type { ReportContent, SectionKey } from "../report-content";
import type { Summary } from "../summary";
import { GUIDANCE, compact, estimateRowHeight, freeRightColumn, stripGuidance, widenTables } from "./cleanup";
import { addText, appendixPages, paragraphs, picturePages, setCoverPhoto, summaryPage, textHeight, textPages, type Picture } from "./extras";
import {
  EMU_PER_INCH,
  NS,
  Pptx,
  children,
  descendants,
  first,
  frame,
  insertPicture,
  moveShape,
  parse,
  removeShape,
  replaceText,
  setParagraphText,
  shapeText,
  shapes,
  tableWith,
  tables,
  textOf,
  type Slide,
  type Table,
} from "./pptx/ooxml";

export type Logo = { data: Uint8Array; ext: "png" | "jpeg"; width: number; height: number };

/** Det, der ikke er tal: rapportens tekster, billeder, ledelsesoversigt og kundens design */
export type TemplateExtras = {
  content: ReportContent;
  /** Billeder pr. plads ("foreword", "about", "section:b5", "appendix") i visningsrækkefølge */
  pictures: Record<string, Picture[]>;
  /** null = ledelsesoversigten er slået fra */
  summary: Summary | null;
  /** Hex uden #, fx "0B3D91". null = skabelonens grønne */
  brandColor: string | null;
  cover: Picture | null;
};

/** Skabelonens slidenumre (1-baseret) */
const S = {
  aboutTemplate: 1,
  overviewBasic: 2,
  overviewComprehensive: 3,
  valueChainCap: 4,
  cover: 5,
  contents: 6,
  b1: 7,
  b1b: 8,
  b1c: 9,
  b2: 10,
  b3energy: 11,
  b3ghg: 12,
  b4: 13,
  b5: 14,
  b6: 15,
  b7circular: 16,
  b7waste: 17,
  b7materials: 18,
  b8: 19,
  b8countries: 20,
  b9: 21,
  b10: 22,
  b10b: 23,
  b11: 24,
  cDivider: 25,
  c1: 26,
  c2: 27,
  scope3: 28,
  c3targets: 29,
  c3transition: 30,
  c4: 31,
  c4b: 32,
  c5: 33,
  c5b: 34,
  c6: 35,
  c6b: 36,
  c7own: 37,
  c7valueChain: 38,
  c8: 39,
  c9: 40,
  end: 41,
} as const;

const inch = (v: number) => Math.round(v * EMU_PER_INCH);
const SLIDE_SIZE = { w: 12192000, h: 6858000 };

/** Hvilken slide i skabelonen hver afsnitskommentar hører til */
const SECTION_SLIDES: Record<SectionKey, number> = {
  b1: S.b1,
  b1Figures: S.b1b,
  b1Locations: S.b1c,
  b2: S.b2,
  b3Energy: S.b3energy,
  b3Ghg: S.b3ghg,
  scope3: S.scope3,
  b4: S.b4,
  b5: S.b5,
  b6: S.b6,
  b7Circular: S.b7circular,
  b7Waste: S.b7waste,
  b7Materials: S.b7materials,
  b8: S.b8,
  b8Countries: S.b8countries,
  b9: S.b9,
  b10: S.b10,
  b10b: S.b10b,
  b11: S.b11,
  c1: S.c1,
  c2: S.c2,
  c3: S.c3targets,
  c3Transition: S.c3transition,
  c4: S.c4,
  c5: S.c5,
  c6: S.c6,
  c7: S.c7own,
  c8: S.c8,
  c9: S.c9,
};

/** Skabelonens indholdsslides (B1–C9), dvs. dem med vejledning, der skal ryddes op */
const isContentSlide = (no: number) => no >= S.b1 && no <= S.c9 && no !== S.cDivider;

const titleOf = (slide: Slide) => {
  const t = shapes(slide).find((x) => first(x, NS.p, "ph")?.getAttribute("type") === "title");
  return (t ? shapeText(t) : "").replace(/\s+/g, " ").replace(/\s*[–-]\s*fortsat\s*$/i, "").trim();
};
const SLIDE_BOTTOM = inch(7.0);
const CONTINUATION_TOP = inch(1.11);

const mark = (v: string | null, yes: boolean) => {
  if (!v) return "–";
  if (v === "Ja") return yes ? "X" : "";
  if (v === "Nej") return yes ? "" : "X";
  return yes ? v : "";
};

/* ------------------------------------------------------------------ */
/* Lange tabeller                                                      */
/* ------------------------------------------------------------------ */

/** Den laveste y, tabellen må nå ned til: toppen af næste figur under den (i samme kolonne) */
function bottomLimit(slide: Slide, table: Table): number {
  const f = frame(table.frame)!;
  const below = shapes(slide)
    .filter((s) => s !== table.frame)
    .map((s) => ({ s, f: frame(s) }))
    .filter(({ f: g }) => g && g.y >= f.y + f.h - inch(0.05) && g.x < f.x + f.w && g.x + g.w > f.x && g.h > inch(0.15))
    .map(({ f: g }) => g!.y);
  // Skabelonens egen tabel må altid stå, hvor den står (nogle går helt ned til sidefoden)
  return Math.max(Math.min(SLIDE_BOTTOM, ...below) - inch(0.08), f.y + f.h);
}

type Element = ReturnType<typeof children>[number];

/**
 * Fordeler tabellens rækker over sliden og om nødvendigt kopier af den ("– fortsat").
 * Kopierne indeholder kun titel, sidehoved/-fod og tabellens overskriftsrækker + de næste rækker.
 * `limit` skal være beregnet, før tabellen blev udfyldt.
 */
async function paginate(pptx: Pptx, slide: Slide, find: (s: Slide) => Table, headerRows: number, limit: number, after: Slide): Promise<Slide> {
  const table = find(slide);
  const f = frame(table.frame)!;
  const widths = children(first(table.tbl, NS.a, "tblGrid")!, NS.a, "gridCol").map((c) => Number(c.getAttribute("w")));
  const all = table.rows;
  const heights = all.map((tr) => estimateRowHeight(tr, widths));
  const headerH = heights.slice(0, headerRows).reduce((s, h) => s + h, 0);

  // Del rækkerne op i sider
  const pages: number[][] = [];
  let current: number[] = [];
  let y = f.y + headerH;
  let bottom = limit;
  for (let i = headerRows; i < all.length; i++) {
    if (y + heights[i] > bottom && current.length > 0) {
      pages.push(current);
      current = [];
      y = CONTINUATION_TOP + headerH;
      bottom = SLIDE_BOTTOM;
    }
    current.push(i);
    y += heights[i];
  }
  pages.push(current);
  if (pages.length === 1) return after;

  // Kopier laves før originalen beskæres; hver kopi beholder sin del af rækkerne
  let last = after;
  for (const page of pages.slice(1)) {
    const copy = await pptx.duplicate(slide, last);
    const t = find(copy);
    const keep = new Set([...Array(headerRows).keys(), ...page]);
    [...t.rows.keys()].filter((i) => !keep.has(i)).reverse().forEach((i) => t.removeRow(i));
    for (const s of shapes(copy)) {
      if (s === t.frame) continue;
      const ph = first(s, NS.p, "ph");
      const type = ph?.getAttribute("type");
      if (type === "title") {
        const p = descendants(s, NS.a, "p").find((x) => textOf(x).trim());
        // Skabelonens egne fortsættelsesslides hedder allerede "– fortsat"
        if (p && !/fortsat\s*$/i.test(textOf(p))) setParagraphText(p, `${textOf(p).trim()} – fortsat`);
        continue;
      }
      if (type === "ftr" || type === "sldNum") continue;
      removeShape(s);
    }
    moveShape(t.frame, CONTINUATION_TOP - frame(t.frame)!.y);
    last = copy;
  }
  const t = find(slide);
  const firstPage = new Set([...Array(headerRows).keys(), ...pages[0]]);
  [...t.rows.keys()].filter((i) => !firstPage.has(i)).reverse().forEach((i) => t.removeRow(i));
  return last;
}

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */

function whiteBox(slide: Slide, box: { x: number; y: number; w: number; h: number }) {
  const doc = slide.doc;
  const tree = first(doc, NS.p, "spTree")!;
  const ids = descendants(doc, NS.p, "cNvPr").map((c) => Number(c.getAttribute("id")) || 0);
  const xml = `<p:sp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvSpPr><p:cNvPr id="${Math.max(0, ...ids) + 1}" name="Logo baggrund"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${box.h}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
  tree.appendChild(doc.importNode(parse(xml).documentElement!, true));
}

async function placeLogo(pptx: Pptx, slide: Slide, logo: Logo, box: { x: number; y: number; maxW: number; h: number }, background = false) {
  const ratio = logo.width / logo.height;
  let h = box.h;
  let w = h * ratio;
  if (w > box.maxW) {
    w = box.maxW;
    h = w / ratio;
  }
  if (background) {
    const pad = inch(0.12);
    whiteBox(slide, { x: box.x - pad, y: box.y - pad, w: Math.round(w + 2 * pad), h: Math.round(h + 2 * pad) });
  }
  const rId = await pptx.addImage(slide, logo.data, logo.ext);
  insertPicture(slide, rId, { x: box.x, y: box.y, w, h }, "Logo");
}

/* ------------------------------------------------------------------ */
/* Indholdsfortegnelse                                                 */
/* ------------------------------------------------------------------ */

function fillContents(pptx: Pptx, slide: Slide, sections: { title: string; slide: Slide | undefined }[]) {
  const body = shapes(slide).find((s) => first(s, NS.p, "ph")?.getAttribute("type") === "body");
  const titleShape = shapes(slide).find((s) => first(s, NS.p, "ph")?.getAttribute("type") === "title");
  if (titleShape) {
    // "[Indholdet kan tilpasses …]" fjernes
    for (const p of descendants(titleShape, NS.a, "p").slice(1)) p.parentNode!.removeChild(p);
    const tb = first(titleShape, NS.p, "txBody")!;
    for (const br of descendants(tb, NS.a, "br")) br.parentNode!.removeChild(br);
    for (const r of descendants(tb, NS.a, "r")) if ((first(r, NS.a, "t")?.textContent ?? "").includes("[")) r.parentNode!.removeChild(r);
  }
  if (!body) return;
  const txBody = first(body, NS.p, "txBody")!;
  const paras = children(txBody, NS.a, "p");
  const proto = paras.find((p) => first(p, NS.a, "buAutoNum"));
  if (!proto) return;
  const leading = paras.slice(0, paras.indexOf(proto));
  for (const p of paras) if (!leading.includes(p)) txBody.removeChild(p);
  const doc = slide.doc;
  for (const sec of sections) {
    const page = sec.slide ? pptx.slides.indexOf(sec.slide) + 1 : 0;
    if (!page) continue;
    const p = proto.cloneNode(true) as Element;
    // Én højrestillet tabulator ved kanten af tekstfeltet
    const tabLst = first(p, NS.a, "tabLst");
    if (tabLst) {
      for (const t of children(tabLst, NS.a, "tab")) tabLst.removeChild(t);
      const tab = doc.createElementNS(NS.a, "a:tab");
      tab.setAttribute("pos", String(inch(8.3)));
      tab.setAttribute("algn", "r");
      tabLst.appendChild(tab);
    }
    const runs = children(p, NS.a, "r");
    const titleRun = runs[0];
    const pageRun = runs[1] ?? runs[0];
    for (const r of runs.slice(1)) p.removeChild(r);
    setParagraphText(p, `${sec.title}\t`);
    const r = pageRun.cloneNode(true) as Element;
    first(r, NS.a, "t")!.textContent = `Side ${page}`;
    p.insertBefore(r, children(p, NS.a, "endParaRPr")[0] ?? null);
    void titleRun;
    txBody.appendChild(p);
  }
}

/* ------------------------------------------------------------------ */
/* Udfyldning                                                          */
/* ------------------------------------------------------------------ */

const LEFTOVER = /\[(Indsæt|indsæt|Sæt kryds|JA\/NEJ|Antal personer|fx |Type af|Materiale|Land |Handling|Angiv|Beskriv|lav\/|0-1|Udfyldes)[^\]]*\]/;

export async function fillEsgTemplate(
  template: Buffer | Uint8Array,
  m: ExportModel,
  logo?: Logo | null,
  extras?: TemplateExtras | null,
): Promise<{ buffer: Buffer; leftovers: string[] }> {
  const pptx = await Pptx.load(template);
  const at = (no: number) => pptx.byTemplate(no);

  // 1. Struktur: hvilke slides indgår
  const drop: number[] = [S.aboutTemplate, S.overviewBasic, S.overviewComprehensive, S.valueChainCap];
  if (!m.scope3) drop.push(S.scope3);
  if (!m.comprehensive || m.c3.targets.length === 0) drop.push(S.c3targets);
  if (!m.comprehensive || !m.c3.transition) drop.push(S.c3transition);
  if (!m.comprehensive || m.c4.risks.length === 0) drop.push(S.c4, S.c4b);
  else if (m.c4.financial.length === 0) drop.push(S.c4b);
  if (!m.b2.any) drop.push(S.b2);
  if (m.b4.length === 0) drop.push(S.b4);
  if (m.b5.length === 0) drop.push(S.b5);
  if (m.b7.materials.length === 0) drop.push(S.b7materials);
  if (!m.b8.otherCountries) drop.push(S.b8countries);
  if (!m.comprehensive) {
    // Scope 3 hører til B3 og kan stå i en B-rapport; resten af Udvidet Modul fjernes
    for (let i: number = S.cDivider; i <= S.c9; i++) if (i !== S.scope3) drop.push(i);
  } else {
    if (m.c5.selfEmployed === null && m.c5.agency === null) drop.push(S.c5b);
    if (!m.c6.anyPolicy) drop.push(S.c6b);
    if (!m.c8) drop.push(S.c8);
    if (!m.c9) drop.push(S.c9);
  }
  pptx.remove(...drop.map(at));
  // Scope 3 præsenteres sammen med scope 1 og 2 (VS pkt. 52)
  if (at(S.scope3)) pptx.move(at(S.scope3)!, at(S.b3ghg)!);

  // Vejledningen til den, der udfylder skabelonen, fjernes. Indholdet rykkes først op efter
  // udfyldningen, så tabellerne har skabelonens fulde plads, før de evt. deles over flere sider.
  for (const s of pptx.slides) if (isContentSlide(s.templateNo)) stripGuidance(s);

  const year = String(m.year);

  // 2. Forside og afslutning
  const cover = at(S.cover)!;
  replaceText(cover.doc, "OPGØRELSE 20XX", m.draft ? `OPGØRELSE ${year} · UDKAST` : `OPGØRELSE ${year}`);
  const end = at(S.end);
  if (end) {
    const body = shapes(end).find((s) => first(s, NS.p, "ph")?.getAttribute("type") !== "title" && shapeText(s).includes("[Indsæt informationer"));
    const tb = body && first(body, NS.p, "txBody");
    if (tb) {
      const paras = children(tb, NS.a, "p");
      paras.slice(1).forEach((p) => tb.removeChild(p));
      setParagraphText(paras[0], m.contact[0] ?? "");
      let prev = paras[0];
      for (const line of m.contact.slice(1)) {
        const p = paras[0].cloneNode(true) as Element;
        setParagraphText(p, line);
        tb.insertBefore(p, prev.nextSibling);
        prev = p;
      }
      // Teksten står på den mørkegrønne boks og skal være hvid
      for (const rPr of descendants(tb, NS.a, "rPr")) {
        for (const f of children(rPr, NS.a, "solidFill")) rPr.removeChild(f);
        const fill = end.doc.createElementNS(NS.a, "a:solidFill");
        const c = end.doc.createElementNS(NS.a, "a:schemeClr");
        c.setAttribute("val", "bg1");
        fill.appendChild(c);
        rPr.insertBefore(fill, rPr.firstChild);
      }
    }
  }

  // 3. B1
  {
    const s = at(S.b1)!;
    const t27a = tableWith(s, "pkt. 27a");
    t27a.set(1, 1, m.comprehensive ? "NEJ" : "JA");
    t27a.set(2, 1, m.comprehensive ? "JA" : "NEJ");
    const t27c = tableWith(s, "pkt. 27c");
    t27c.set(1, 1, m.consolidated ? "NEJ" : "JA");
    t27c.set(2, 1, m.consolidated ? "JA" : "NEJ");
    if (!m.consolidated || m.b1.subsidiaries.length === 0) {
      removeShape(tableWith(s, "pkt. 27d").frame);
      removeShape(shapes(s).find((x) => shapeText(x).startsWith("Oplysningspunktet skal udfyldes, hvis relevant")));
    } else {
      const find = (sl: Slide) => tableWith(sl, "pkt. 27d");
      const t = find(s);
      const limit = bottomLimit(s, t);
      // Undertitlen "Tabellen slettes, hvis …" er en vejledning
      const header = first(t.cell(0, 0), NS.a, "txBody")!;
      for (const p of children(header, NS.a, "p").slice(1)) header.removeChild(p);
      t.fillRows(2, 3, m.b1.subsidiaries.map((x) => [x.name, x.address]));
      await paginate(pptx, s, find, 2, limit, s);
    }
  }
  {
    const s = at(S.b1b)!;
    const t = tableWith(s, "pkt. 27e");
    t.set(1, 1, m.b1.legalForm);
    t.set(2, 1, m.b1.nace);
    t.set(3, 1, m.b1.balance);
    t.set(4, 1, m.b1.turnover);
    t.set(5, 1, m.b1.employees);
    tableWith(s, "pkt. 27b").set(1, 1, m.b1.omissions ?? "Ingen udeladelser");
  }
  {
    const s = at(S.b1c)!;
    const locFind = (sl: Slide) => tableWith(sl, "Sted");
    const lt = locFind(s);
    const locLimit = bottomLimit(s, lt);
    const certFind = (sl: Slide) => tableWith(sl, "pkt. 28");
    const ct = certFind(s);
    const certLimit = bottomLimit(s, ct);
    lt.fillRows(
      2,
      3,
      m.b1.locations.length ? m.b1.locations.map((l) => [l.name, l.street, l.postal, l.city, l.country, l.geo]) : [["Ingen registrerede lokationer", "", "", "", "", ""]],
    );
    ct.fillRows(1, 3, m.b1.certifications.length ? m.b1.certifications.map((c) => [c.name, c.description, c.date, c.rating]) : [["Ingen ESG-certifikater eller miljømærker", "", "", ""]]);
    const last = await paginate(pptx, s, locFind, 2, locLimit, s);
    await paginate(pptx, s, certFind, 1, certLimit, last);
  }

  // B2
  const b2 = at(S.b2);
  if (b2) {
    const t = tableWith(b2, "pkt. 29a-d");
    m.b2.rows.forEach((r, i) => {
      t.set(i + 1, 1, r.has);
      t.set(i + 1, 2, r.isPublic);
      t.set(i + 1, 3, r.targets);
    });
  }

  // B3
  {
    const t = tableWith(at(S.b3energy)!, "pkt. 32");
    const rows = [m.energy.electricity, m.energy.fuels, m.energy.other, m.energy.total];
    rows.forEach((r, i) => {
      t.set(i + 2, 1, `${r.renewable}`);
      t.set(i + 2, 2, `${r.nonRenewable}`);
      t.set(i + 2, 3, `${r.total}`);
    });
  }
  {
    const s = at(S.b3ghg)!;
    const t = tableWith(s, "pkt. 33");
    t.set(1, 1, `${m.ghg.scope1} t CO₂e`);
    t.set(2, 1, `${m.ghg.scope2Location} t CO₂e`);
    t.set(3, 1, `${m.ghg.totalLocation} t CO₂e`);
    const mb = tableWith(s, "markedsbaseret) (frivillig)");
    mb.set(0, 1, `${m.ghg.scope2Market} t CO₂e`);
    mb.set(1, 1, `${m.ghg.totalMarket} t CO₂e`);
  }

  // Scope 3
  const s3 = at(S.scope3);
  if (s3 && m.scope3) {
    const title = shapes(s3).find((x) => first(x, NS.p, "ph")?.getAttribute("type") === "title");
    const tp = title && descendants(title, NS.a, "p").find((p) => textOf(p).trim());
    if (tp) setParagraphText(tp, "CO₂e-udledning i scope 3 (B3)");
    const find = (sl: Slide) => tableWith(sl, "tilføjes til tabel i pkt. 33");
    const t = find(s3);
    const limit = bottomLimit(s3, t);
    t.fillRows(1, 1, [["CO₂e-udledninger i scope 3", `${m.scope3.total} t CO₂e`], ...m.scope3.categories.map((c) => [`   ${c.label}`, `${c.value} t CO₂e`])]);
    t.set(t.rows.length - 1, 0, "Total CO₂e-udledning for scope 1, 2 og 3 (scope 2 lokationsbaseret)");
    t.set(t.rows.length - 1, 1, `${m.scope3.totalAll} t CO₂e`);
    const proto = 1;
    // Lange forklaringer står i den brede kolonne i almindelig skrift
    if (m.scope3.notRelevantNumbers.length) {
      const reason = m.scope3.exclusionReason ? ` ${m.scope3.exclusionReason}` : "";
      t.appendRow(proto, [`Kategorier vurderet som ikke relevante: ${m.scope3.notRelevantNumbers.join(", ")}.${reason}`, ""], { plain: true });
    }
    if (m.scope3.boundary) t.appendRow(proto, [`Afgrænsning og metode: ${m.scope3.boundary}`, ""], { plain: true });
    await paginate(pptx, s3, find, 1, limit, s3);
  }

  // B4
  const b4 = at(S.b4);
  if (b4) {
    const find = (sl: Slide) => tableWith(sl, "pkt. 34");
    const t = find(b4);
    const limit = bottomLimit(b4, t);
    const link = tables(b4).find((x) => textOf(x.tbl).startsWith("Informationen om forurening"));
    if (m.b4Links.length && link) link.set(0, 0, `Informationen om forurening fra ${m.companyName} er offentligt tilgængelig her: ${m.b4Links.join(", ")}`);
    else removeShape(link?.frame);
    t.fillRows(2, 3, m.b4.map((p) => [p.substance, p.amount, p.medium]));
    await paginate(pptx, b4, find, 2, m.b4Links.length ? limit : SLIDE_BOTTOM, b4);
  }

  // B5
  const b5 = at(S.b5);
  if (b5) {
    const find = (sl: Slide) => tableWith(sl, "pkt. 35");
    const t = find(b5);
    const limit = bottomLimit(b5, t);
    t.fillRows(2, 3, m.b5.map((b) => [b.location, b.areaHa, b.areaName, b.relation]));
    await paginate(pptx, b5, find, 2, limit, b5);
  }

  // B6
  {
    const s = at(S.b6)!;
    tableWith(s, "pkt. 36").set(1, 1, m.b6.intake);
    const t = tableWith(s, "pkt. 37");
    t.set(1, 1, m.b6.consumption ?? "Ikke væsentligt");
    t.set(2, 1, m.b6.consumptionStress ?? "0 m³");
  }

  // B7
  {
    const s = at(S.b7circular)!;
    const t = tableWith(s, "pkt. 38");
    t.set(2, 1, mark(m.b7.circular, true));
    t.set(2, 2, mark(m.b7.circular, false));
    const d = tableWith(s, "Beskrivelse af, hvordan");
    d.set(1, 0, m.b7.circularText ?? "Virksomheden anvender ikke principper fra cirkulær økonomi.");
  }
  {
    const s = at(S.b7waste)!;
    const find = (sl: Slide) => tableWith(sl, "Samlet mængde affald");
    const t = find(s);
    const limit = bottomLimit(s, t);
    const none = [["Ingen registreret", "–", "–"]];
    t.fillRows(7, 3, m.b7.hazardous.length ? m.b7.hazardous.map((w) => [w.type, w.total, w.recycled]) : none);
    t.fillRows(3, 3, m.b7.nonHazardous.length ? m.b7.nonHazardous.map((w) => [w.type, w.total, w.recycled]) : none);
    await paginate(pptx, s, find, 2, limit, s);
  }
  const mat = at(S.b7materials);
  if (mat) {
    const find = (sl: Slide) => tableWith(sl, "pkt. 39c");
    const t = find(mat);
    const limit = bottomLimit(mat, t);
    t.fillRows(1, 3, m.b7.materials.map((x) => [x.material, x.amount]));
    await paginate(pptx, mat, find, 1, limit, mat);
  }

  // B8
  {
    const s = at(S.b8)!;
    const c = tableWith(s, "pkt. 40a");
    c.set(1, 1, m.b8.temporary);
    c.set(2, 1, m.b8.permanent);
    c.set(3, 1, m.b8.total);
    const g = tableWith(s, "pkt. 40b");
    [m.b8.male, m.b8.female, m.b8.other, m.b8.unreported, m.b8.total].forEach((v, i) => g.set(i + 1, 1, v));
    for (const t of [c, g]) t.set(0, 1, `Antal ansatte (${m.b8.unitLabel})`);
  }
  const countries = at(S.b8countries);
  if (countries) {
    const find = (sl: Slide) => tableWith(sl, "pkt. 40c");
    const t = find(countries);
    const limit = bottomLimit(countries, t);
    t.fillRows(1, 3, m.b8.countries.map((x) => [x.country, x.count]));
    t.set(t.findRow("Totalt"), 1, m.b8.total);
    t.set(0, 1, `Antal ansatte (${m.b8.unitLabel})`);
    await paginate(pptx, countries, find, 1, limit, countries);
  }

  // B9–B11
  {
    const s = at(S.b9)!;
    const a = tableWith(s, "pkt. 41a");
    a.set(1, 1, m.b9.accidents);
    a.set(2, 1, m.b9.rate);
    const f = tableWith(s, "pkt. 41b");
    f.set(1, 1, m.b9.fatalAccidents);
    f.set(2, 1, m.b9.fatalIllHealth);
  }
  {
    const s = at(S.b10)!;
    const w = tableWith(s, "42a");
    w.set(1, 1, mark(m.b10.minWage, true));
    w.set(1, 2, mark(m.b10.minWage, false));
    tableWith(s, "pkt. 42b").set(1, 1, m.b10.payGap ?? "Ikke omfattet af krav om oplysning");
    const s2 = at(S.b10b)!;
    tableWith(s2, "pkt. 42c").set(1, 1, m.b10.cba);
    tableWith(s2, "pkt. 42d").set(1, 1, m.b10.training);
  }
  {
    const t = tableWith(at(S.b11)!, "pkt. 43");
    t.set(1, 1, m.b11.convictions);
    t.set(1, 2, m.b11.fines);
  }

  // Udvidet Modul
  if (m.comprehensive) {
    const c1 = at(S.c1)!;
    tableWith(c1, "pkt. 46a").set(1, 0, m.c1.products ?? "Ikke oplyst");
    tableWith(c1, "pkt. 46b").set(1, 0, m.c1.markets ?? "Ikke oplyst");
    tableWith(c1, "pkt. 46c").set(1, 0, m.c1.relations ?? "Ikke oplyst");
    tableWith(c1, "pkt. 46d").set(1, 0, m.c1.strategy ?? "Virksomheden har ikke oplyst strategielementer, der vedrører bæredygtighed.");

    const c2 = at(S.c2)!;
    const c2Find = (sl: Slide) => tableWith(sl, "pkt. 47");
    const t2 = c2Find(c2);
    const c2Limit = bottomLimit(c2, t2);
    m.c2.forEach((r, i) => {
      t2.set(i + 1, 1, r.any ? r.description : "Ingen");
      t2.set(i + 1, 2, r.any ? `Målsætninger: ${r.targets}` : "–");
      t2.set(i + 1, 3, r.any ? r.responsible : "–");
    });
    await paginate(pptx, c2, c2Find, 1, c2Limit, c2);

    // C3 – reduktionsmål og tiltag
    const c3 = at(S.c3targets);
    if (c3) {
      const t = tableWith(c3, "pkt. 53a-d");
      t.set(1, 1, "Reduktionsmål (målår)");
      t.set(1, 2, "CO₂e-udledning i basisår");
      t.set(1, 3, "Andel af scope (pkt. 53d)");
      t.fillRows(2, 3, m.c3.targets.map((x) => [x.scope, x.target, x.baseline, x.share]));
      const aFind = (sl: Slide) => tableWith(sl, "pkt. 53e");
      const a = aFind(c3);
      const aLimit = bottomLimit(c3, a);
      // Færre mål end skabelonens tre rækker: tiltagslisten rykker op under målene
      const tf = frame(t.frame)!;
      const af = frame(a.frame)!;
      const targetsBottom = tf.y + t.rows.reduce((sum, r) => sum + Number(r.getAttribute("h") ?? 0), 0);
      if (af.y - targetsBottom > inch(0.4)) moveShape(a.frame, targetsBottom + inch(0.3) - af.y);
      a.fillRows(1, 3, (m.c3.actions.length ? m.c3.actions : ["Ingen tiltag oplyst"]).map((x) => [x]));
      await paginate(pptx, c3, aFind, 1, aLimit, c3);
    }
    const c3t = at(S.c3transition);
    if (c3t && m.c3.transition) {
      const tr = m.c3.transition;
      tableWith(c3t, "pkt. 54").set(1, 0, tr.plan ?? (tr.hasPlan === "Nej" ? "Selskabet har ikke vedtaget en omstillingsplan." : "Omstillingsplanen er ikke beskrevet."));
      const t55 = tableWith(c3t, "pkt. 55");
      t55.set(1, 1, tr.hasPlan === "Ja" ? "Ikke relevant – planen er vedtaget" : (tr.willAdopt ?? "–"));
      t55.set(2, 1, tr.when ?? "–");
    }

    // C4 – klimarisici
    const c4 = at(S.c4);
    if (c4) {
      const find = (sl: Slide) => tableWith(sl, "pkt. 56a");
      const t = find(c4);
      const limit = bottomLimit(c4, t);
      const group = (type: string) => {
        const list = m.c4.risks.filter((r) => r.type === type).map((r) => ["", r.area, r.description, r.exposure, r.sensitivity, r.horizon, r.adaptation]);
        return list.length ? list : [["", "–", "Ingen identificeret", "", "", "", ""]];
      };
      // Nedefra, så rækkenumrene for de øvre grupper ikke flytter sig
      t.fillRows(11, 3, group("TRANSITION"), { stripMerge: true });
      t.fillRows(7, 3, group("ACUTE"), { stripMerge: true });
      t.fillRows(3, 3, group("CHRONIC"), { stripMerge: true });
      if (m.c4.assessment) t.appendRow(2, ["Vurdering af eksponering og følsomhed (pkt. 56b)", m.c4.assessment]);
      await paginate(pptx, c4, find, 2, limit, c4);
    }
    const c4b = at(S.c4b);
    if (c4b) {
      const t = tableWith(c4b, "pkt. 57");
      const group = (type: string) => {
        const list = m.c4.financial.filter((r) => r.type === type).map((r) => [r.description, r.impact, r.level, r.horizon]);
        return list.length ? list : [["Ingen oplyst", "–", "", ""]];
      };
      t.fillRows(9, 2, group("TRANSITION"));
      t.fillRows(6, 2, group("ACUTE"));
      t.fillRows(3, 2, group("CHRONIC"));
    }

    const c5 = at(S.c5)!;
    tableWith(c5, "pkt. 58").set(1, 1, m.c5.turnover);
    tableWith(c5, "pkt. 59").set(1, 1, m.c5.managementRatio ?? "Ikke oplyst");
    const c5b = at(S.c5b);
    if (c5b) {
      const t = tableWith(c5b, "pkt. 60");
      t.set(2, 1, m.c5.selfEmployed === null ? "–" : String(m.c5.selfEmployed));
      t.set(3, 1, m.c5.agency === null ? "–" : String(m.c5.agency));
    }

    const c6 = at(S.c6)!;
    const t6 = tableWith(c6, "pkt. 61a");
    t6.set(0, 1, m.c6.policy);
    t6.set(1, 1, m.c6.grievance);
    const c6b = at(S.c6b);
    if (c6b) {
      const t = tableWith(c6b, "pkt. 61b");
      m.c6.covers.forEach(([, v], i) => t.set(i + 1, 1, v));
    }

    const t7 = tableWith(at(S.c7own)!, "pkt. 62a");
    m.c7.own.forEach(([, v], i) => t7.set(i + 1, 1, v !== "Nej" && v !== "–" && m.c7.actions ? `${v}\nTiltag: ${m.c7.actions}` : v));
    const t7c = tableWith(at(S.c7valueChain)!, "pkt. 62c");
    m.c7.valueChain.forEach(([, v], i) => t7c.set(i + 1, 1, v));

    const c8 = at(S.c8);
    if (c8 && m.c8) {
      const t = tableWith(c8, "pkt. 63");
      m.c8.forEach((v, i) => t.set(i + 2, 1, v));
    }
    const c9 = at(S.c9);
    if (c9 && m.c9) tableWith(c9, "pkt. 64").set(1, 1, m.c9);
  }

  // 3b. Afsnitskommentarer, billeder og de valgfrie ekstra sider
  const content = extras?.content ?? {};
  const pictures = (slot: string) => extras?.pictures[slot] ?? [];
  const source = at(S.b11)!;
  for (const [key, no] of Object.entries(SECTION_SLIDES) as [SectionKey, number][]) {
    const s = at(no);
    if (!s) continue;
    // Originalen og evt. "– fortsat"-kopier
    const group = pptx.slides.filter((x) => x.templateNo === no);
    group.forEach((x) => compact(x));
    const comment = content.sections?.[key]?.trim();
    let last = group[group.length - 1];
    let placed = false;
    if (comment) {
      const col = freeRightColumn(s);
      const ps = paragraphs(comment);
      const h = textHeight(ps, col.w / EMU_PER_INCH - 0.3, 10) + inch(0.2);
      if (col.w >= inch(2.4) && h <= col.h) {
        addText(s, { ...col, h }, ps, { size: 10, fill: "E8ECEA", inset: inch(0.15) });
        placed = true;
      }
    }
    for (const x of group) if (!(placed && x === s)) widenTables(x);
    const title = titleOf(s);
    if (comment && !placed) last = await textPages(pptx, source, last, `${title} – kommentar`, comment);
    if (pictures(`section:${key}`).length) await picturePages(pptx, source, last, title, pictures(`section:${key}`));
  }

  // Forrest: forord, om virksomheden og ledelsesoversigt (efter forsiden, før indholdsfortegnelsen)
  {
    let anchor = cover;
    if (content.foreword || pictures("foreword").length) anchor = await textPages(pptx, source, anchor, "Forord", content.foreword ?? "", pictures("foreword"));
    if (content.about || pictures("about").length) anchor = await textPages(pptx, source, anchor, `Om ${m.companyName}`, content.about ?? "", pictures("about"));
    if (extras?.summary) await summaryPage(pptx, source, anchor, extras.summary, content.summary ?? {});
  }

  // Bagerst: kommentarer til opgørelsen og bilag (før afslutningssliden)
  const back: { title: string; slide: Slide | undefined }[] = [];
  {
    const firstAfter = (before: Slide) => pptx.slides[pptx.slides.indexOf(before) + 1];
    let anchor = end ? pptx.slides[pptx.slides.indexOf(end) - 1] : pptx.slides[pptx.slides.length - 1];
    if (content.closing) {
      const before = anchor;
      anchor = await textPages(pptx, source, anchor, "Kommentarer til opgørelsen", content.closing);
      back.push({ title: "Kommentarer til opgørelsen", slide: firstAfter(before) });
    }
    if (pictures("appendix").length) {
      await appendixPages(pptx, source, anchor, pictures("appendix"));
      back.push({ title: "Bilag", slide: firstAfter(anchor) });
    }
  }

  // 4. Fælles pladsholdere på alle slides
  for (const s of pptx.slides) {
    // Tabelstilens fede sidste række bruges kun til totaler
    for (const t of tables(s)) {
      const last = t.rows[t.rows.length - 1];
      if (last && !/^Total/i.test(textOf(children(last, NS.a, "tc")[0]).trim())) first(t.tbl, NS.a, "tblPr")?.removeAttribute("lastRow");
    }
    replaceText(s.doc, "KLIK FOR AT INDSÆTTE FIRMANAVN", m.footerName);
    replaceText(s.doc, /\[[Ii]ndsæt (virksomhedsnavn|firmanavn)\]/g, m.companyName);
    replaceText(s.doc, /\[Indsæt årstal ?\]/g, year);
  }

  // 5. Indholdsfortegnelse (efter alle strukturændringer, så sidetallene passer)
  const contents = at(S.contents);
  if (contents) {
    const sections: { title: string; slide: Slide | undefined }[] = [
      { title: "Generelle oplysninger", slide: at(S.b1) },
      { title: "Indsatser, politikker og initiativer for omstilling til en mere bæredygtig økonomi", slide: at(S.b2) },
      { title: "Energiforbrug", slide: at(S.b3energy) },
      { title: "CO₂e-udledning", slide: at(S.b3ghg) },
      { title: "CO₂e-udledning i scope 3", slide: at(S.scope3) },
      { title: "Forurening af luft, vand og jord", slide: at(S.b4) },
      { title: "Biodiversitet", slide: at(S.b5) },
      { title: "Vand", slide: at(S.b6) },
      { title: "Ressourceforbrug, cirkulær økonomi og affaldshåndtering", slide: at(S.b7circular) },
      { title: "Egen arbejdsstyrke: Generelle karakteristika", slide: at(S.b8) },
      { title: "Egen arbejdsstyrke: Sundhed og sikkerhed", slide: at(S.b9) },
      { title: "Egen arbejdsstyrke: Vederlag, overenskomster og uddannelse", slide: at(S.b10) },
      { title: "Virksomhedsadfærd", slide: at(S.b11) },
      ...(m.comprehensive
        ? [
            { title: "Strategi: Forretningsmodel og bæredygtighedsinitiativer (C1)", slide: at(S.c1) },
            { title: "Beskrivelse af indsatser, politikker og initiativer (C2)", slide: at(S.c2) },
            { title: "Mål for reduktion af drivhusgasemissioner (C3)", slide: at(S.c3targets) ?? at(S.c3transition) },
            { title: "Klimarisici (C4)", slide: at(S.c4) },
            { title: "Supplerende oplysninger om arbejdsstyrken (C5)", slide: at(S.c5) },
            { title: "Menneskerettigheder (C6–C7)", slide: at(S.c6) },
            { title: "Indtægter fra bestemte aktiviteter (C8)", slide: at(S.c8) },
            { title: "Kønsfordeling i øverste ledelsesorgan (C9)", slide: at(S.c9) },
          ]
        : []),
      ...back,
    ];
    fillContents(pptx, contents, sections);
  }

  // 6. Logo: forside, afslutning og øverst til venstre på indholdsslides
  if (logo) {
    for (const s of pptx.slides) {
      if (s === cover) await placeLogo(pptx, s, logo, { x: inch(0.7), y: inch(0.6), maxW: inch(2.4), h: inch(0.7) }, true);
      else if (s === end) await placeLogo(pptx, s, logo, { x: inch(1.07), y: inch(3.35), maxW: inch(2.4), h: inch(0.6) }, true);
      else if (s.templateNo !== S.cDivider) await placeLogo(pptx, s, logo, { x: inch(0.57), y: inch(0.14), maxW: inch(1.6), h: inch(0.3) });
    }
  }

  // 7. Kundens design: forsidefoto og farve
  if (extras?.cover) await setCoverPhoto(pptx, cover, extras.cover, SLIDE_SIZE);
  if (extras?.brandColor) {
    const palette = brandPalette(extras.brandColor);
    const recolor = (doc: Slide["doc"]) => {
      for (const c of descendants(doc, NS.a, "srgbClr")) {
        const to = palette[(c.getAttribute("val") ?? "").toUpperCase()];
        if (to) c.setAttribute("val", to);
      }
    };
    for (const s of pptx.slides) recolor(s.doc);
    for (const part of [...pptx.partNames("ppt/slideLayouts/"), ...pptx.partNames("ppt/slideMasters/"), ...pptx.partNames("ppt/theme/")]) {
      if (!part.includes("/_rels/")) await pptx.editXml(part, recolor);
    }
  }

  // 8. Tjek for glemte pladsholdere og vejledning
  const leftovers: string[] = [];
  for (const [i, s] of pptx.slides.entries()) {
    for (const p of descendants(s.doc, NS.a, "p")) {
      const t = descendants(p, NS.a, "t").map((x) => x.textContent ?? "").join("");
      const hit = t.match(LEFTOVER) ?? t.match(GUIDANCE);
      if (hit) leftovers.push(`Slide ${i + 1}: ${hit[0].trim()}`);
    }
  }

  return { buffer: await pptx.save(), leftovers };
}
