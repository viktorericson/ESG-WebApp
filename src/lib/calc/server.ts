import "server-only";
import { cache } from "react";
import { db } from "../db";
import { calcCompany, type CompanyInput, type CompanyResult } from "./company";
import { consolidate } from "./consolidate";
import type { FactorLookup, FactorValue } from "./types";

/** Faktorsættet for et rapporteringsår: årets valg, ellers det globale standardsæt */
export const factorSetForPeriod = cache(async (periodId: string) => {
  const period = await db.reportingPeriod.findUniqueOrThrow({ where: { id: periodId }, include: { factorSet: true } });
  const set = period.factorSet ?? (await db.factorSet.findFirst({ where: { isDefault: true, organizationId: null } }));
  return { period, set };
});

/**
 * Faktorer for et sæt og år. Findes året ikke i sættet, bruges nærmeste tidligere år
 * (eller tidligste år, hvis rapporteringsåret ligger før sættets første år).
 */
export const loadLookup = cache(async (setId: string, year: number) => {
  const years = await db.emissionFactor.findMany({ where: { setId }, distinct: ["year"], select: { year: true }, orderBy: { year: "asc" } });
  const available = years.map((y) => y.year);
  const factorYear = [...available].reverse().find((y) => y <= year) ?? available[0];
  const rows = factorYear === undefined ? [] : await db.emissionFactor.findMany({ where: { setId, year: factorYear } });
  const map = new Map<string, FactorValue>(rows.map((r) => [r.key, { scope1: r.scope1, scope2: r.scope2, scope3: r.scope3, outsideScopes: r.outsideScopes, unit: r.unit, source: r.source }]));
  const lookup: FactorLookup = (key) => map.get(key);
  return { lookup, factorYear: factorYear ?? null, count: rows.length };
});

const UNIT_LABELS: Record<string, string> = { DKK: "kr.", Ton: "ton", "person.km": "personkm", "ton.km": "tonkm", "Antal ansatte pr. år": "ansat pr. år" };

/**
 * Klimakompassets scope 3-faktorer til valg i Scope 3-modulet: indkøb, transport, affald og
 * solgte produkter for årets faktorsæt (samme år som beregningen bruger).
 */
export const scope3FactorOptions = cache(async (periodId: string) => {
  const { period, set } = await factorSetForPeriod(periodId);
  if (!set) return [];
  const { factorYear } = await loadLookup(set.id, period.year);
  if (factorYear === null) return [];
  const rows = await db.emissionFactor.findMany({
    where: { setId: set.id, year: factorYear, scope3: { gt: 0 }, mainCategory: { in: ["Indkøb", "Transport", "Affald & genbrug", "Solgte produkter"] } },
    select: { key: true, mainCategory: true, category: true, parameter1: true, parameter2: true, unit: true },
    orderBy: [{ mainCategory: "asc" }, { category: "asc" }, { parameter1: "asc" }, { parameter2: "asc" }],
  });
  return rows.map((r) => ({
    value: r.key,
    label: `${r.mainCategory} › ${r.category}: ${[r.parameter1, r.parameter2].filter(Boolean).join(", ")} (pr. ${UNIT_LABELS[r.unit] ?? r.unit})`,
  }));
});

const MODULE_KEYS = {
  general: "company.general",
  workforce: "company.workforce",
  health: "company.health",
  pay: "company.pay",
  governance: "company.governance",
  materials: "company.materials",
  scope1: "company.scope1",
  scope3: "company.scope3",
} as const;

export type CompanyCalculation = {
  result: CompanyResult;
  factorSet: { id: string; name: string; version: string } | null;
  factorYear: number | null;
};

/** Beregner selskabets nøgletal for et rapporteringsår ud fra de gemte modulsvar */
export const calculateCompany = cache(async (periodId: string, companyId: string): Promise<CompanyCalculation> => {
  const [{ period, set }, rows, locations] = await Promise.all([
    factorSetForPeriod(periodId),
    db.moduleData.findMany({ where: { periodId, companyId, status: { not: "NOT_RELEVANT" } }, select: { moduleKey: true, locationId: true, answers: true } }),
    db.location.findMany({ where: { companyId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const answersFor = (moduleKey: string, locationId: string | null = null) =>
    rows.find((r) => r.moduleKey === moduleKey && r.locationId === locationId)?.answers as Record<string, unknown> | undefined;

  const input: CompanyInput = {
    modules: Object.fromEntries(Object.entries(MODULE_KEYS).map(([k, key]) => [k, answersFor(key)])),
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      energy: answersFor("location.energy", l.id),
      water: answersFor("location.water", l.id),
      waste: answersFor("location.waste", l.id),
      biodiversity: answersFor("location.biodiversity", l.id),
    })),
  };

  const { lookup, factorYear } = set ? await loadLookup(set.id, period.year) : { lookup: (() => undefined) as FactorLookup, factorYear: null };
  const result = calcCompany(input, lookup);
  if (!set) result.issues.unshift({ level: "missing", message: "Der er intet faktorsæt. Importér Klimakompassets faktorer (npm run factors:import)." });
  return { result, factorSet: set ? { id: set.id, name: set.name, version: set.version } : null, factorYear };
});

/** Konsolideret opgørelse for et sæt selskaber i et rapporteringsår */
async function calculateGroup(periodId: string, companies: { id: string; name: string }[], opts: { reportingCompanyId: string; consolidatedTurnover: number | null }) {
  const calcs = await Promise.all(companies.map((c) => calculateCompany(periodId, c.id)));
  const group = consolidate(
    companies.map((c, i) => ({ companyId: c.id, name: c.name, result: calcs[i].result })),
    opts,
  );
  return { group, factorSet: calcs[0]?.factorSet ?? null, factorYear: calcs[0]?.factorYear ?? null };
}

/** Konsolideret opgørelse for en rapport (fuld konsolidering af de omfattede selskaber) */
export const calculateReport = cache(async (reportId: string) => {
  const report = await db.report.findUniqueOrThrow({
    where: { id: reportId },
    include: { companies: { include: { company: true } } },
  });
  const companies = report.companies.map((c) => c.company).filter((c) => !c.archivedAt);
  return calculateGroup(report.periodId, companies, {
    reportingCompanyId: report.reportingCompanyId,
    consolidatedTurnover: report.basis === "CONSOLIDATED" ? report.consolidatedTurnover : null,
  });
});

/** Rapporteringsåret før, hvis det findes og der er indrapporteret data for selskaberne */
async function previousPeriod(periodId: string, companyIds: string[]) {
  const period = await db.reportingPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const prev = await db.reportingPeriod.findFirst({ where: { organizationId: period.organizationId, year: period.year - 1 } });
  if (!prev) return null;
  const rows = await db.moduleData.count({ where: { periodId: prev.id, companyId: { in: companyIds }, status: { in: ["IN_PROGRESS", "COMPLETED"] } } });
  return rows > 0 ? prev : null;
}

/** Selskabets nøgletal for året før – til sammenligning. null hvis der ikke er data. */
export const calculateCompanyPrevious = cache(async (periodId: string, companyId: string) => {
  const prev = await previousPeriod(periodId, [companyId]);
  if (!prev) return null;
  return { year: prev.year, calc: await calculateCompany(prev.id, companyId) };
});

/** Rapportens selskaber konsolideret for året før – til sammenligning. null hvis der ikke er data. */
export const calculateReportPrevious = cache(async (reportId: string) => {
  const report = await db.report.findUniqueOrThrow({ where: { id: reportId }, include: { companies: { include: { company: true } } } });
  const companies = report.companies.map((c) => c.company).filter((c) => !c.archivedAt);
  const prev = await previousPeriod(report.periodId, companies.map((c) => c.id));
  if (!prev) return null;
  // Den konsoliderede omsætning er rapportens eget år og bruges ikke for året før
  const { group } = await calculateGroup(prev.id, companies, { reportingCompanyId: report.reportingCompanyId, consolidatedTurnover: null });
  return { year: prev.year, group };
});
