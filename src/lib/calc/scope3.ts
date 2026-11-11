/**
 * Scope 3 (VS pkt. 49–52, GHG-protokollens 15 kategorier).
 *
 * - Kategori 3 (brændsels- og energirelaterede aktiviteter) beregnes automatisk ud fra
 *   scope 1 og 2: Klimakompassets scope 3-del af de samme faktorer (opstrøms udledning).
 * - Øvrige kategorier indtastes som aktiviteter: mængde × Klimakompasset-faktor, eller
 *   leverandørens egen opgørelse i t CO₂e, som så går forud.
 */
import type { CalcIssue, FactorLookup } from "./types";

type Row = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const SCOPE3_CATEGORIES: { n: number; label: string; upstream: boolean }[] = [
  { n: 1, label: "Indkøbte varer og tjenesteydelser", upstream: true },
  { n: 2, label: "Kapitalgoder", upstream: true },
  { n: 3, label: "Brændsels- og energirelaterede aktiviteter", upstream: true },
  { n: 4, label: "Transport og distribution (opstrøms)", upstream: true },
  { n: 5, label: "Affald fra driften", upstream: true },
  { n: 6, label: "Forretningsrejser", upstream: true },
  { n: 7, label: "Medarbejderpendling", upstream: true },
  { n: 8, label: "Leasede aktiver (opstrøms)", upstream: true },
  { n: 9, label: "Transport og distribution (nedstrøms)", upstream: false },
  { n: 10, label: "Forarbejdning af solgte produkter", upstream: false },
  { n: 11, label: "Brug af solgte produkter", upstream: false },
  { n: 12, label: "Bortskaffelse af solgte produkter", upstream: false },
  { n: 13, label: "Leasede aktiver (nedstrøms)", upstream: false },
  { n: 14, label: "Franchises", upstream: false },
  { n: 15, label: "Investeringer", upstream: false },
];

export const categoryLabel = (c: number) => `${c}. ${SCOPE3_CATEGORIES.find((x) => x.n === c)?.label ?? "Ukendt"}`;

export type Scope3Line = { category: number; label: string; tCO2e: number; source: "factor" | "supplier" | "auto"; locationId: string | null };

export type Scope3Result = {
  /** Selskabet opgør scope 3 */
  included: boolean;
  totalT: number;
  byCategory: Record<number, number>;
  lines: Scope3Line[];
  relevant: number[];
  notRelevant: number[];
  exclusionReason: string | null;
  boundary: string | null;
  issues: CalcIssue[];
};

export const emptyScope3 = (): Scope3Result => ({
  included: false,
  totalT: 0,
  byCategory: {},
  lines: [],
  relevant: [],
  notRelevant: [],
  exclusionReason: null,
  boundary: null,
  issues: [],
});

/**
 * @param upstreamT opstrøms udledning fra selskabets egne brændsler og energi (scope 1 + lokationernes el og varme)
 */
export function calcScope3(a: Row | undefined, lookup: FactorLookup, upstreamT: number): Scope3Result {
  const r = emptyScope3();
  if (!a || a.includeScope3 !== "yes") return r;
  r.included = true;
  r.relevant = SCOPE3_CATEGORIES.filter((c) => a[`cat${c.n}`] === "RELEVANT").map((c) => c.n);
  r.notRelevant = SCOPE3_CATEGORIES.filter((c) => a[`cat${c.n}`] === "NOT_RELEVANT").map((c) => c.n);
  r.exclusionReason = typeof a.exclusionReason === "string" && a.exclusionReason.trim() ? a.exclusionReason.trim() : null;
  r.boundary = typeof a.boundary === "string" && a.boundary.trim() ? a.boundary.trim() : null;

  if (a.autoCategory3 === "yes" && upstreamT > 0) {
    r.lines.push({ category: 3, label: "Opstrøms udledning fra brændsler, el og varme (beregnet fra scope 1 og 2)", tCO2e: upstreamT, source: "auto", locationId: null });
  }

  const rows = Array.isArray(a.activities) ? (a.activities as Row[]) : [];
  for (const row of rows) {
    const category = Number(row.category);
    if (!Number.isInteger(category) || category < 1 || category > 15) continue;
    const label = String(row.description ?? "").trim() || categoryLabel(category);
    const locationId = typeof row.location === "string" ? row.location : null;
    const supplier = n(row.supplierT);
    if (supplier !== null) {
      r.lines.push({ category, label, tCO2e: supplier, source: "supplier", locationId });
      continue;
    }
    const amount = n(row.amount);
    const key = typeof row.factor === "string" ? row.factor : null;
    if (amount === null || !key) {
      r.issues.push({ level: "missing", message: `Scope 3 “${label}”: angiv mængde og faktor, eller leverandørens opgørelse i t CO₂e.` });
      continue;
    }
    const f = lookup(key);
    if (!f) {
      r.issues.push({ level: "missing", message: `Scope 3 “${label}”: faktoren findes ikke i årets faktorsæt.` });
      continue;
    }
    // Klimakompassets scope 3-del; for faktorer uden opdeling bruges den samlede værdi
    const kg = f.scope3 > 0 ? f.scope3 : f.scope1 + f.scope2;
    r.lines.push({ category, label, tCO2e: (amount * kg) / 1000, source: "factor", locationId });
  }

  for (const l of r.lines) r.byCategory[l.category] = (r.byCategory[l.category] ?? 0) + l.tCO2e;
  r.totalT = r.lines.reduce((s, l) => s + l.tCO2e, 0);
  const missingRelevant = r.relevant.filter((c) => !r.byCategory[c]);
  if (missingRelevant.length) {
    r.issues.push({ level: "missing", message: `Scope 3: ingen data for de relevante kategorier ${missingRelevant.join(", ")}.` });
  }
  return r;
}
