import "server-only";
import { cache } from "react";
import { db } from "../db";
import { calcCompany, type CompanyInput, type CompanyResult } from "./company";
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

const MODULE_KEYS = {
  general: "company.general",
  workforce: "company.workforce",
  health: "company.health",
  pay: "company.pay",
  governance: "company.governance",
  materials: "company.materials",
  scope1: "company.scope1",
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
