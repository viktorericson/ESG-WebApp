/**
 * Små, robuste operationer på en PowerPoint-pakke (OOXML), så en skabelon kan
 * udfyldes uden at miste dens layout: slet/dupliker slides, erstat tekst,
 * udfyld tabeller og indsæt billeder.
 *
 * Der arbejdes direkte på XML'en med en DOM, så alt, vi ikke rører, bevares 1:1.
 */
import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom";

export const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
};

const REL_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const REL_NOTES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
const CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";

/** Farver skabelonen bruger til pladsholdertekst ("[Indsæt …]") – fjernes, når feltet udfyldes */
const PLACEHOLDER_COLORS = new Set(["2D55FF", "accent2", "accent3"]);

export const EMU_PER_INCH = 914400;

export const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc as never);

export const children = (el: Element, ns: string, local: string): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === ns && (n as Element).localName === local);
export const descendants = (el: Element | Document, ns: string, local: string): Element[] =>
  Array.from(el.getElementsByTagNameNS(ns, local)) as Element[];
export const first = (el: Element | Document, ns: string, local: string): Element | undefined => descendants(el, ns, local)[0];

/** Al tekst i et element (runs og felter), afsnit adskilt af linjeskift. Virker også på ét afsnit. */
export function textOf(el: Element): string {
  if (el.namespaceURI === NS.a && el.localName === "p") return descendants(el, NS.a, "t").map((t) => t.textContent ?? "").join("");
  return descendants(el, NS.a, "p")
    .map((p) => descendants(p, NS.a, "t").map((t) => t.textContent ?? "").join(""))
    .join("\n");
}

export type Slide = {
  /** Fx ppt/slides/slide7.xml */
  path: string;
  doc: Document;
  /** Nummer i skabelonen (1-baseret) – bruges til at finde slides igen efter sletning/duplikering */
  templateNo: number;
};

export class Pptx {
  private constructor(
    private readonly zip: JSZip,
    private readonly presentation: Document,
    private readonly presRels: Document,
    private readonly contentTypes: Document,
    /** Slides i præsentationsrækkefølge */
    public slides: Slide[],
  ) {}

  static async load(data: Buffer | Uint8Array): Promise<Pptx> {
    const zip = await JSZip.loadAsync(data);
    const read = async (p: string) => parse(await zip.file(p)!.async("string"));
    const presentation = await read("ppt/presentation.xml");
    const presRels = await read("ppt/_rels/presentation.xml.rels");
    const contentTypes = await read("[Content_Types].xml");
    const relTarget = new Map(descendants(presRels, NS.rel, "Relationship").map((r) => [r.getAttribute("Id")!, r.getAttribute("Target")!]));
    const ids = descendants(presentation, NS.p, "sldId");
    const slides: Slide[] = [];
    for (const [i, s] of ids.entries()) {
      const target = relTarget.get(s.getAttributeNS(NS.r, "id")!)!;
      const path = `ppt/${target.replace(/^\/?ppt\//, "")}`;
      slides.push({ path, doc: await read(path), templateNo: i + 1 });
    }
    return new Pptx(zip, presentation, presRels, contentTypes, slides);
  }

  /** Slide fra skabelonens oprindelige nummer (første forekomst) */
  byTemplate(no: number): Slide | undefined {
    return this.slides.find((s) => s.templateNo === no);
  }

  private relsPath(partPath: string) {
    const i = partPath.lastIndexOf("/");
    return `${partPath.slice(0, i)}/_rels/${partPath.slice(i + 1)}.rels`;
  }

  private async rels(partPath: string): Promise<Document> {
    const f = this.zip.file(this.relsPath(partPath));
    return parse(f ? await f.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}"/>`);
  }

  private sldIdFor(slide: Slide): Element {
    const rel = descendants(this.presRels, NS.rel, "Relationship").find((r) => `ppt/${r.getAttribute("Target")!.replace(/^\/?ppt\//, "")}` === slide.path)!;
    return descendants(this.presentation, NS.p, "sldId").find((s) => s.getAttributeNS(NS.r, "id") === rel.getAttribute("Id"))!;
  }

  /** Fjerner slides fra præsentationen (selve filerne slettes ved gem, hvis de ikke længere bruges) */
  remove(...slides: (Slide | undefined)[]) {
    for (const slide of slides) {
      if (!slide || !this.slides.includes(slide)) continue;
      const sldId = this.sldIdFor(slide);
      const rId = sldId.getAttributeNS(NS.r, "id");
      sldId.parentNode!.removeChild(sldId);
      const rel = descendants(this.presRels, NS.rel, "Relationship").find((r) => r.getAttribute("Id") === rId);
      rel?.parentNode!.removeChild(rel);
      this.slides = this.slides.filter((s) => s !== slide);
      this.zip.remove(slide.path);
      this.zip.remove(this.relsPath(slide.path));
      const ct = descendants(this.contentTypes, NS.ct, "Override").find((o) => o.getAttribute("PartName") === `/${slide.path}`);
      ct?.parentNode!.removeChild(ct);
    }
  }

  /** Flytter en slide, så den står lige efter `after` */
  move(slide: Slide, after: Slide) {
    if (slide === after) return;
    const id = this.sldIdFor(slide);
    const anchor = this.sldIdFor(after);
    anchor.parentNode!.insertBefore(id, anchor.nextSibling);
    this.slides = this.slides.filter((s) => s !== slide);
    this.slides.splice(this.slides.indexOf(after) + 1, 0, slide);
  }

  /** Kopierer en slide og indsætter kopien efter `after` (standard: originalen). Noter følger ikke med. */
  async duplicate(slide: Slide, after: Slide = slide): Promise<Slide> {
    const files = Object.keys(this.zip.files);
    let n = 1;
    while (files.includes(`ppt/slides/slide${n}.xml`) || this.slides.some((s) => s.path === `ppt/slides/slide${n}.xml`)) n++;
    const path = `ppt/slides/slide${n}.xml`;

    const doc = parse(serialize(slide.doc));
    const rels = await this.rels(slide.path);
    for (const r of descendants(rels, NS.rel, "Relationship")) if (r.getAttribute("Type") === REL_NOTES) r.parentNode!.removeChild(r);
    this.zip.file(this.relsPath(path), serialize(rels));

    const types = this.contentTypes.documentElement!;
    const ov = this.contentTypes.createElementNS(NS.ct, "Override");
    ov.setAttribute("PartName", `/${path}`);
    ov.setAttribute("ContentType", CT_SLIDE);
    types.appendChild(ov);

    const relIds = descendants(this.presRels, NS.rel, "Relationship").map((r) => Number(r.getAttribute("Id")!.replace(/\D/g, "")) || 0);
    const rId = `rId${Math.max(0, ...relIds) + 1}`;
    const rel = this.presRels.createElementNS(NS.rel, "Relationship");
    rel.setAttribute("Id", rId);
    rel.setAttribute("Type", REL_SLIDE);
    rel.setAttribute("Target", `slides/slide${n}.xml`);
    this.presRels.documentElement!.appendChild(rel);

    const sldIds = descendants(this.presentation, NS.p, "sldId");
    const newId = Math.max(255, ...sldIds.map((s) => Number(s.getAttribute("id")))) + 1;
    const anchor = this.sldIdFor(after);
    const sldId = this.presentation.createElementNS(NS.p, "p:sldId");
    sldId.setAttribute("id", String(newId));
    sldId.setAttributeNS(NS.r, "r:id", rId);
    anchor.parentNode!.insertBefore(sldId, anchor.nextSibling);

    const copy: Slide = { path, doc, templateNo: slide.templateNo };
    this.slides.splice(this.slides.indexOf(after) + 1, 0, copy);
    return copy;
  }

  /** Tilføjer et billede til mediemappen og returnerer et relations-id på sliden */
  async addImage(slide: Slide, data: Uint8Array, ext: "png" | "jpeg"): Promise<string> {
    let n = 1;
    while (this.zip.file(`ppt/media/export-image${n}.${ext}`)) n++;
    const media = `ppt/media/export-image${n}.${ext}`;
    this.zip.file(media, data);
    if (!descendants(this.contentTypes, NS.ct, "Default").some((d) => d.getAttribute("Extension") === ext)) {
      const def = this.contentTypes.createElementNS(NS.ct, "Default");
      def.setAttribute("Extension", ext);
      def.setAttribute("ContentType", `image/${ext}`);
      this.contentTypes.documentElement!.insertBefore(def, this.contentTypes.documentElement!.firstChild);
    }
    const rels = await this.rels(slide.path);
    const ids = descendants(rels, NS.rel, "Relationship").map((r) => Number(r.getAttribute("Id")!.replace(/\D/g, "")) || 0);
    const rId = `rId${Math.max(0, ...ids) + 1}`;
    const rel = rels.createElementNS(NS.rel, "Relationship");
    rel.setAttribute("Id", rId);
    rel.setAttribute("Type", REL_IMAGE);
    rel.setAttribute("Target", `../media/${media.split("/").pop()}`);
    rels.documentElement!.appendChild(rel);
    this.zip.file(this.relsPath(slide.path), serialize(rels));
    return rId;
  }

  async save(): Promise<Buffer> {
    for (const s of this.slides) this.zip.file(s.path, serialize(s.doc));
    this.zip.file("ppt/presentation.xml", serialize(this.presentation));
    this.zip.file("ppt/_rels/presentation.xml.rels", serialize(this.presRels));
    await this.removeUnreachable();
    this.zip.file("[Content_Types].xml", serialize(this.contentTypes));

    // Ny pakke uden mappeposter (de kan få cloud-tjenester til at afvise filen)
    const out = new JSZip();
    for (const [name, entry] of Object.entries(this.zip.files)) {
      if (entry.dir) continue;
      out.file(name, await entry.async("uint8array"), { createFolders: false });
    }
    return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  /**
   * Fjerner dele, der ikke længere kan nås fra pakkens rod via relationer –
   * fx noter og billeder fra slettede slides – og deres indholdstyper.
   */
  private async removeUnreachable() {
    const reached = new Set<string>();
    const queue = ["_rels/.rels"];
    const resolve = (from: string, target: string) => {
      if (target.startsWith("/")) return target.slice(1);
      const base = from.replace(/_rels\/[^/]*\.rels$/, "").split("/").filter(Boolean);
      for (const seg of target.split("/")) {
        if (seg === "..") base.pop();
        else if (seg !== ".") base.push(seg);
      }
      return base.join("/");
    };
    while (queue.length) {
      const relsPath = queue.shift()!;
      const f = this.zip.file(relsPath);
      if (!f) continue;
      const doc = parse(await f.async("string"));
      for (const r of descendants(doc, NS.rel, "Relationship")) {
        if (r.getAttribute("TargetMode") === "External") continue;
        const part = resolve(relsPath, r.getAttribute("Target")!);
        if (reached.has(part) || !this.zip.file(part)) continue;
        reached.add(part);
        queue.push(this.relsPath(part));
      }
    }
    for (const name of Object.keys(this.zip.files)) {
      const entry = this.zip.files[name];
      if (entry.dir || name === "[Content_Types].xml" || name.endsWith(".rels")) continue;
      if (!reached.has(name)) this.zip.remove(name);
    }
    for (const name of Object.keys(this.zip.files)) {
      if (!name.endsWith(".rels") || name === "_rels/.rels") continue;
      const owner = name.replace(/_rels\/([^/]+)\.rels$/, "$1");
      if (!this.zip.file(owner)) this.zip.remove(name);
    }
    for (const o of descendants(this.contentTypes, NS.ct, "Override")) {
      if (!this.zip.file(o.getAttribute("PartName")!.slice(1))) o.parentNode!.removeChild(o);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tekst                                                               */
/* ------------------------------------------------------------------ */

const fillColor = (fill: Element) => first(fill, NS.a, "srgbClr")?.getAttribute("val")?.toUpperCase() ?? first(fill, NS.a, "schemeClr")?.getAttribute("val");

/**
 * Pladsholderfarven erstattes med skabelonens tekstfarve (tx2). Den kan ikke bare fjernes,
 * for så arver teksten tabelstilens farve, som er hvid i overskriftsrækker.
 */
function cleanRunProps(rPr: Element) {
  for (const fill of children(rPr, NS.a, "solidFill")) {
    const c = fillColor(fill);
    if (!c || !PLACEHOLDER_COLORS.has(c)) continue;
    const doc = rPr.ownerDocument!;
    const solid = doc.createElementNS(NS.a, "a:solidFill");
    const scheme = doc.createElementNS(NS.a, "a:schemeClr");
    scheme.setAttribute("val", "tx2");
    solid.appendChild(scheme);
    rPr.replaceChild(solid, fill);
  }
  rPr.removeAttribute("err");
  rPr.removeAttribute("dirty");
}

/**
 * Sætter teksten i et afsnit og bevarer formateringen fra afsnittets første run.
 * Fjerner felter og linjeskift, så kun den nye tekst står tilbage.
 */
export function setParagraphText(p: Element, text: string, opts: { bold?: boolean } = {}) {
  const doc = p.ownerDocument!;
  const runs = children(p, NS.a, "r");
  const template = runs[0] ? first(runs[0], NS.a, "rPr") : (children(p, NS.a, "endParaRPr")[0] ?? undefined);
  for (const el of Array.from(p.childNodes) as Element[]) {
    if (el.nodeType === 1 && ["r", "fld", "br"].includes(el.localName!)) p.removeChild(el);
  }
  if (!text) return;
  const r = doc.createElementNS(NS.a, "a:r");
  const rPr = template ? (template.cloneNode(true) as Element) : doc.createElementNS(NS.a, "a:rPr");
  if (rPr.localName !== "rPr") {
    // endParaRPr → rPr
    const real = doc.createElementNS(NS.a, "a:rPr");
    for (const attr of Array.from(rPr.attributes)) real.setAttribute(attr.name, attr.value);
    for (const c of Array.from(rPr.childNodes)) real.appendChild(c.cloneNode(true));
    cleanRunProps(real);
    r.appendChild(real);
  } else {
    cleanRunProps(rPr);
    r.appendChild(rPr);
  }
  if (opts.bold !== undefined) (first(r, NS.a, "rPr") as Element).setAttribute("b", opts.bold ? "1" : "0");
  const t = doc.createElementNS(NS.a, "a:t");
  if (/^\s|\s$/.test(text)) t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  t.appendChild(doc.createTextNode(text));
  r.appendChild(t);
  const end = children(p, NS.a, "endParaRPr")[0];
  p.insertBefore(r, end ?? null);
}

/**
 * Sætter teksten i en tekstkrop (celle eller figur). Linjeskift giver nye afsnit
 * med samme afsnits- og tegnformatering som det første.
 */
export function setBodyText(body: Element, text: string) {
  const paras = children(body, NS.a, "p");
  const firstP = paras[0];
  if (!firstP) return;
  for (const p of paras.slice(1)) body.removeChild(p);
  const lines = text.split("\n");
  setParagraphText(firstP, lines[0]);
  let prev = firstP;
  for (const line of lines.slice(1)) {
    const p = firstP.cloneNode(true) as Element;
    setParagraphText(p, line);
    body.insertBefore(p, prev.nextSibling);
    prev = p;
  }
}

/**
 * Erstatter tekst afsnit for afsnit, også når skabelonens tekst er splittet over
 * flere runs. Returnerer antal erstatninger.
 */
export function replaceText(root: Element | Document, find: string | RegExp, replace: string): number {
  let count = 0;
  const single = typeof find === "string" ? null : new RegExp(find.source, find.flags.replace("g", ""));
  for (const p of descendants(root, NS.a, "p")) {
    const runs = children(p, NS.a, "r");
    // Ligger match'et inden for ét run, ændres kun det, så afsnittets øvrige formatering bevares
    let inRun = false;
    for (const r of runs) {
      const t = first(r, NS.a, "t");
      const text = t?.textContent ?? "";
      const hit = typeof find === "string" ? text.includes(find) : single!.test(text);
      if (!t || !hit) continue;
      t.textContent = typeof find === "string" ? text.split(find).join(replace) : text.replace(find, replace);
      const rPr = first(r, NS.a, "rPr");
      if (rPr) cleanRunProps(rPr);
      inRun = true;
      count++;
    }
    if (inRun) continue;
    const full = runs.map((r) => first(r, NS.a, "t")?.textContent ?? "").join("");
    const matches = typeof find === "string" ? full.includes(find) : single!.test(full);
    if (!matches) continue;
    const next = typeof find === "string" ? full.split(find).join(replace) : full.replace(find, replace);
    count++;
    // Bevar formateringen fra det run, hvor match'et starter
    const startIdx = typeof find === "string" ? full.indexOf(find) : full.search(find);
    let pos = 0;
    let keep = runs[0];
    for (const r of runs) {
      const len = (first(r, NS.a, "t")?.textContent ?? "").length;
      if (startIdx < pos + len) {
        keep = r;
        break;
      }
      pos += len;
    }
    // Hele afsnittet skrives i ét run med match-run'ets formatering
    if (keep !== runs[0]) p.insertBefore(keep, runs[0]);
    setParagraphText(p, next);
  }
  return count;
}

/* ------------------------------------------------------------------ */
/* Figurer og tabeller                                                 */
/* ------------------------------------------------------------------ */

/** Figurer (sp, graphicFrame, pic, grpSp) direkte i slidens træ */
export function shapes(slide: Slide): Element[] {
  const tree = first(slide.doc, NS.p, "spTree")!;
  return Array.from(tree.childNodes).filter((n): n is Element => n.nodeType === 1 && ["sp", "graphicFrame", "pic", "grpSp", "cxnSp"].includes((n as Element).localName!));
}

export function shapeText(shape: Element): string {
  const body = first(shape, NS.p, "txBody");
  return body ? textOf(body) : "";
}

export function removeShape(shape: Element | undefined) {
  shape?.parentNode?.removeChild(shape);
}

/** Position og størrelse (EMU) */
export function frame(shape: Element): { x: number; y: number; w: number; h: number } | null {
  const xfrm = first(shape, NS.a, "xfrm") ?? first(shape, NS.p, "xfrm");
  if (!xfrm) return null;
  const off = first(xfrm, NS.a, "off");
  const ext = first(xfrm, NS.a, "ext");
  if (!off || !ext) return null;
  return { x: Number(off.getAttribute("x")), y: Number(off.getAttribute("y")), w: Number(ext.getAttribute("cx")), h: Number(ext.getAttribute("cy")) };
}

export function moveShape(shape: Element, dy: number) {
  const xfrm = first(shape, NS.a, "xfrm") ?? first(shape, NS.p, "xfrm");
  const off = xfrm && first(xfrm, NS.a, "off");
  if (off) off.setAttribute("y", String(Number(off.getAttribute("y")) + dy));
}

export class Table {
  constructor(
    readonly frame: Element,
    readonly tbl: Element,
  ) {}

  get rows(): Element[] {
    return children(this.tbl, NS.a, "tr");
  }

  cell(row: number, col: number): Element {
    const tr = this.rows[row];
    if (!tr) throw new Error(`Tabellen har ikke række ${row}`);
    const tc = children(tr, NS.a, "tc")[col];
    if (!tc) throw new Error(`Række ${row} har ikke kolonne ${col}`);
    return tc;
  }

  text(row: number, col: number) {
    return textOf(this.cell(row, col));
  }

  set(row: number, col: number, text: string) {
    const body = first(this.cell(row, col), NS.a, "txBody");
    if (!body) return;
    setBodyText(body, text);
    if (row > 0 && !(this.hasTotalRow && row === this.rows.length - 1)) this.plain(body);
  }

  private get hasTotalRow() {
    return first(this.tbl, NS.a, "tblPr")?.getAttribute("lastRow") === "1";
  }

  /**
   * Data skrives ikke-fed. Tabelstilen kan ellers gøre sidste række fed (LibreOffice gør det
   * også, når stilen er slået fra), hvilket kun giver mening for totaler.
   */
  private plain(body: Element) {
    for (const rPr of descendants(body, NS.a, "rPr")) if (!rPr.hasAttribute("b")) rPr.setAttribute("b", "0");
  }

  /** Erstatter tekst i en celle uden at røre resten (fx "[Indsæt årstal]" i en overskrift) */
  replace(row: number, col: number, find: string | RegExp, replace: string) {
    return replaceText(this.cell(row, col), find, replace);
  }

  /** Første række, hvis første celle indeholder teksten */
  findRow(contains: string): number {
    return this.rows.findIndex((tr) => textOf(children(tr, NS.a, "tc")[0]).includes(contains));
  }

  /**
   * Erstatter rækkerne [start, start+templateCount) med én række pr. element,
   * kopieret fra rækken `start`. Tabellens højde justeres.
   */
  fillRows(start: number, templateCount: number, values: string[][], opts: { stripMerge?: boolean } = {}) {
    const rows = this.rows;
    const proto = rows[start];
    const anchor = rows[start + templateCount] ?? null;
    const removed = rows.slice(start, start + templateCount);
    const removedH = removed.reduce((s, r) => s + Number(r.getAttribute("h") ?? 0), 0);
    for (const r of removed) this.tbl.removeChild(r);
    let addedH = 0;
    for (const vals of values) {
      const tr = proto.cloneNode(true) as Element;
      this.tbl.insertBefore(tr, anchor);
      const tcs = children(tr, NS.a, "tc");
      // Lodret flettede celler (rowSpan/vMerge) giver ikke mening i kopierede rækker
      if (opts.stripMerge) for (const tc of tcs) for (const attr of ["rowSpan", "vMerge"]) tc.removeAttribute(attr);
      vals.forEach((v, i) => {
        const body = tcs[i] && first(tcs[i], NS.a, "txBody");
        if (!body) return;
        setBodyText(body, v);
        this.plain(body);
      });
      addedH += Number(tr.getAttribute("h") ?? 0);
    }
    this.adjustHeight(addedH - removedH);
    // Tabelstilens fremhævede sidste række er kun meningsfuld for en totalrække
    if (!anchor) first(this.tbl, NS.a, "tblPr")?.removeAttribute("lastRow");
  }

  /** Tilføjer en kopi af rækken `protoIndex` sidst i tabellen med de givne celletekster */
  appendRow(protoIndex: number, values: (string | null)[], opts: { plain?: boolean } = {}) {
    const tr = this.rows[protoIndex].cloneNode(true) as Element;
    this.tbl.appendChild(tr);
    const tcs = children(tr, NS.a, "tc");
    values.forEach((v, i) => {
      const body = v !== null && tcs[i] ? first(tcs[i], NS.a, "txBody") : undefined;
      if (!body) return;
      setBodyText(body, v!);
      if (opts.plain) for (const rPr of descendants(body, NS.a, "rPr")) rPr.setAttribute("b", "0");
    });
    this.adjustHeight(Number(tr.getAttribute("h") ?? 0));
  }

  removeRow(index: number) {
    const tr = this.rows[index];
    if (!tr) return;
    this.tbl.removeChild(tr);
    this.adjustHeight(-Number(tr.getAttribute("h") ?? 0));
  }

  private adjustHeight(delta: number) {
    const ext = first(first(this.frame, NS.p, "xfrm")!, NS.a, "ext");
    if (ext) ext.setAttribute("cy", String(Math.max(0, Number(ext.getAttribute("cy")) + delta)));
  }
}

export function tables(slide: Slide): Table[] {
  return shapes(slide)
    .filter((s) => s.localName === "graphicFrame")
    .map((f) => {
      const tbl = first(f, NS.a, "tbl");
      return tbl ? new Table(f, tbl) : null;
    })
    .filter((t): t is Table => t !== null);
}

/** Tabellen, hvis første celle indeholder teksten (fx "pkt. 32") */
export function tableWith(slide: Slide, contains: string): Table {
  const t = tables(slide).find((t) => textOf(t.tbl).includes(contains));
  if (!t) throw new Error(`Fandt ikke tabellen "${contains}" på ${slide.path}`);
  return t;
}

/** Indsætter et billede som figur på sliden */
export function insertPicture(slide: Slide, rId: string, box: { x: number; y: number; w: number; h: number }, name: string) {
  const doc = slide.doc;
  const tree = first(doc, NS.p, "spTree")!;
  const ids = descendants(doc, NS.p, "cNvPr").map((c) => Number(c.getAttribute("id")) || 0);
  const xml = `<p:pic xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:nvPicPr><p:cNvPr id="${Math.max(0, ...ids) + 1}" name="${name}" descr="${name}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const pic = parse(xml).documentElement!;
  tree.appendChild(doc.importNode(pic, true));
}
