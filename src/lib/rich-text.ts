/**
 * Formateret tekst i rapportens tekstfelter, gemt som en lille Markdown-variant, så almindelig
 * tekst fra før editoren stadig virker uændret:
 *
 *   ## Overskrift        → overskrift
 *   - punkt  /  • punkt  → punktliste
 *   1. punkt             → nummereret liste
 *   **fed**  *kursiv*  ++understreget++
 *
 * Bruges både af editoren i browseren og af PowerPoint-eksporten.
 */

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
export type BlockType = "paragraph" | "heading" | "bullet" | "ordered";
export type Block = { type: BlockType; runs: Run[] };

type Mark = "bold" | "italic" | "underline";
const MARKERS: [string, Mark][] = [
  ["**", "bold"],
  ["++", "underline"],
  ["*", "italic"],
];

/** Inline-formatering → runs. En markør uden en senere lukkende markør står som almindelig tekst. */
export function parseInline(line: string): Run[] {
  const runs: Run[] = [];
  const on: Record<Mark, boolean> = { bold: false, italic: false, underline: false };
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const run: Run = { text: buf };
    if (on.bold) run.bold = true;
    if (on.italic) run.italic = true;
    if (on.underline) run.underline = true;
    const prev = runs[runs.length - 1];
    if (prev && !!prev.bold === !!run.bold && !!prev.italic === !!run.italic && !!prev.underline === !!run.underline) prev.text += run.text;
    else runs.push(run);
    buf = "";
  };
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\\" && i + 1 < line.length && "*+\\".includes(line[i + 1])) {
      buf += line[i + 1];
      i += 2;
      continue;
    }
    const hit = MARKERS.find(([m]) => line.startsWith(m, i));
    if (hit) {
      const [m, mark] = hit;
      if (on[mark]) {
        flush();
        on[mark] = false;
        i += m.length;
        continue;
      }
      if (line.indexOf(m, i + m.length) > i + m.length) {
        flush();
        on[mark] = true;
        i += m.length;
        continue;
      }
    }
    buf += line[i];
    i += 1;
  }
  flush();
  return runs;
}

/** Tekst → blokke. Tomme linjer adskiller blot afsnit. */
export function parseRich(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) blocks.push({ type: "heading", runs: parseInline(m[1]) });
    else if ((m = line.match(/^\s*[-•*]\s+(.*)$/))) blocks.push({ type: "bullet", runs: parseInline(m[1]) });
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) blocks.push({ type: "ordered", runs: parseInline(m[1]) });
    else blocks.push({ type: "paragraph", runs: parseInline(line.trim()) });
  }
  return blocks.filter((b) => b.runs.some((r) => r.text.trim()));
}

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/\+\+/g, "\\+\\+");

function serializeRuns(runs: Run[]): string {
  return runs
    .map((r) => {
      // Mellemrum uden for markørerne, så "**fed **ord" ikke opstår
      const lead = r.text.match(/^\s*/)![0];
      const trail = r.text.match(/\s*$/)![0];
      let core = escapeText(r.text.trim());
      if (!core) return r.text;
      if (r.italic) core = `*${core}*`;
      if (r.bold) core = `**${core}**`;
      if (r.underline) core = `++${core}++`;
      return lead + core + trail;
    })
    .join("");
}

/** Blokke → tekst. Nummererede lister tælles forfra efter hvert brud. */
export function serializeRich(blocks: Block[]): string {
  let n = 0;
  return blocks
    .map((b) => {
      n = b.type === "ordered" ? n + 1 : 0;
      const body = serializeRuns(b.runs);
      if (b.type === "heading") return `## ${body}`;
      if (b.type === "bullet") return `- ${body}`;
      if (b.type === "ordered") return `${n}. ${body}`;
      return body;
    })
    .join("\n");
}

/** Den synlige tekst uden formateringstegn */
export const plainText = (text: string) =>
  parseRich(text)
    .map((b) => b.runs.map((r) => r.text).join(""))
    .join("\n");
