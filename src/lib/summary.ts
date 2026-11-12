/**
 * Ledelsesoversigt: nøgletal for miljø, sociale forhold og ledelse med ændring i forhold til året før.
 * Ren funktion, så forhåndsvisningen i appen og PowerPoint-eksporten viser det samme.
 */
import type { CompanyResult } from "./calc/company";
import { totalOf } from "./calc/types";

type Figures = Pick<CompanyResult, "ghg" | "energy" | "water" | "waste" | "workforce" | "health" | "pay" | "governance">;

/** "down" = et fald er en forbedring (fx udledning), "up" = en stigning er en forbedring */
export type Direction = "down" | "up" | null;

export type SummaryTile = {
  label: string;
  value: string;
  /** Ændring ift. året før; null hvis der ikke er et sammenligneligt tal */
  change: number | null;
  /** "%" = relativ ændring i procent; "pp" = forskel i procentpoint (for andele) */
  changeUnit?: "%" | "pp";
  direction: Direction;
};

export type SummaryColumn = { key: "environment" | "social" | "governance"; title: string; tiles: SummaryTile[] };

export type Summary = { year: number; previousYear: number | null; columns: SummaryColumn[] };

const nf = (digits: number) => new Intl.NumberFormat("da-DK", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmt = (v: number | null | undefined, digits: number, unit = "") => (v === null || v === undefined || !Number.isFinite(v) ? "–" : `${nf(digits).format(v)}${unit ? ` ${unit}` : ""}`);

const change = (now: number | null | undefined, before: number | null | undefined) =>
  now === null || now === undefined || before === null || before === undefined || before === 0 ? null : ((now - before) / Math.abs(before)) * 100;

const womenShare = (r: Figures) => {
  const w = r.workforce.byGender.FEMALE ?? 0;
  return r.workforce.total > 0 ? (w / r.workforce.total) * 100 : null;
};

export type SummaryExtras = {
  /** Antal certificeringer/miljømærker (B1) */
  certifications: number;
  /** Emner i politikregistret med praksis og mål / alle emner med praksis (B2) */
  policiesWithTargets: number;
  policies: number;
};

export function buildSummary(year: number, r: Figures, previous: { year: number; r: Figures } | null, extras: SummaryExtras): Summary {
  const p = previous?.r ?? null;
  const tile = (label: string, value: string, now: number | null, before: number | null | undefined, direction: Direction): SummaryTile => ({
    label,
    value,
    change: p ? change(now, before) : null,
    direction,
  });
  /** Andele sammenlignes i procentpoint, ikke som relativ ændring */
  const share = (label: string, now: number | null, before: number | null | undefined, direction: Direction): SummaryTile => ({
    label,
    value: fmt(now, 0, "%"),
    change: p && now !== null && before !== null && before !== undefined ? now - before : null,
    changeUnit: "pp",
    direction,
  });
  const unit = r.workforce.unit === "FTE" ? "FTE" : "ansatte";

  return {
    year,
    previousYear: previous?.year ?? null,
    columns: [
      {
        key: "environment",
        title: "Miljø",
        tiles: [
          tile("Scope 1 + 2", fmt(r.ghg.totalLocationT, 1, "t CO₂e"), r.ghg.totalLocationT, p?.ghg.totalLocationT, "down"),
          tile("Energiforbrug", fmt(totalOf(r.energy.total), 0, "MWh"), totalOf(r.energy.total), p ? totalOf(p.energy.total) : null, "down"),
          tile("Vandindtag", fmt(r.water.intakeM3, 0, "m³"), r.water.intakeM3, p?.water.intakeM3, "down"),
          tile("Affald", fmt(r.waste.totalT, 1, "t"), r.waste.totalT, p?.waste.totalT, "down"),
        ],
      },
      {
        key: "social",
        title: "Social",
        tiles: [
          tile("Medarbejdere", fmt(r.workforce.total, r.workforce.unit === "FTE" ? 1 : 0, unit), r.workforce.total, p?.workforce.total, null),
          share("Andel kvinder", womenShare(r), p ? womenShare(p) : null, null),
          tile("Arbejdsulykker", fmt(r.health.accidents, 0), r.health.accidents, p?.health.accidents, "down"),
          share("Dækket af overenskomst", r.pay.cbaCoveragePct, p?.pay.cbaCoveragePct, null),
        ],
      },
      {
        key: "governance",
        title: "Ledelse",
        tiles: [
          { label: "Politikker med mål", value: extras.policies ? `${extras.policiesWithTargets} af ${extras.policies}` : "–", change: null, direction: null },
          { label: "Certificeringer", value: String(extras.certifications), change: null, direction: null },
          { label: "Domme for korruption", value: fmt(r.governance.convictions, 0), change: null, direction: null },
        ],
      },
    ],
  };
}

/** "+3 %", "−10 %", "+4 pct.-point" eller null */
export const formatChange = (c: number | null, unit: "%" | "pp" = "%") =>
  c === null || !Number.isFinite(c) ? null : `${c > 0 ? "+" : c < 0 ? "−" : "±"}${nf(0).format(Math.abs(c))}${unit === "pp" ? " pct.-point" : " %"}`;

/** Om ændringen er en forbedring (true), en forværring (false) eller neutral (null) */
export const isImprovement = (t: SummaryTile) => (t.change === null || t.direction === null || Math.abs(t.change) < 0.5 ? null : t.direction === "down" ? t.change < 0 : t.change > 0);
