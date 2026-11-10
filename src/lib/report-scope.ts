/**
 * Afgrænsning af en rapport (B1: individuel eller konsolideret + omfattede selskaber).
 * Rene funktioner, så de kan bruges både i UI (standardvalg) og på serveren (validering).
 */
export type Basis = "INDIVIDUAL" | "CONSOLIDATED";
export type CompanyNode = { id: string; parentId: string | null; consolidate: boolean };

/** Selskabet selv + alle dets efterkommere */
export function subtree(companies: CompanyNode[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of companies) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        changed = true;
      }
    }
  }
  return ids;
}

/** Standardvalg: individuel = kun selskabet; konsolideret = selskabet + efterkommere markeret til konsolidering. */
export function defaultIncluded(companies: CompanyNode[], rootId: string, basis: Basis): string[] {
  if (basis === "INDIVIDUAL") return [rootId];
  const tree = subtree(companies, rootId);
  return companies.filter((c) => tree.has(c.id) && (c.id === rootId || c.consolidate)).map((c) => c.id);
}

/** Validerer og normaliserer brugerens valg. Returnerer fejlbesked eller de omfattede id'er. */
export function resolveIncluded(
  companies: CompanyNode[],
  rootId: string,
  basis: Basis,
  selected: string[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!companies.some((c) => c.id === rootId)) return { ok: false, error: "Vælg det rapporterende selskab" };
  if (basis === "INDIVIDUAL") return { ok: true, ids: [rootId] };

  const tree = subtree(companies, rootId);
  const outside = selected.filter((id) => !tree.has(id));
  if (outside.length) return { ok: false, error: "Kun det rapporterende selskab og dets datterselskaber kan indgå" };
  const ids = [...new Set([rootId, ...selected])];
  if (ids.length < 2) return { ok: false, error: "En konsolideret rapport skal omfatte mindst ét datterselskab. Vælg ellers individuel." };
  return { ok: true, ids };
}
