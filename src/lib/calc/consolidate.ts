/**
 * Konsolidering (fuld, 100 %) af selskabernes resultater til en koncernopgørelse.
 *
 * Absolutte tal summeres. Rater og andele genberegnes ud fra de summerede rådata –
 * der tages aldrig gennemsnit af procenter.
 * Kønsfordeling i øverste ledelsesorgan (C9) er det rapporterende selskabs egen.
 */
import type { CompanyResult, RawFigures } from "./company";
import { emptyScope3, type Scope3Result } from "./scope3";
import { addSplit, emptySplit, type CalcIssue, type EnergySplit } from "./types";

export type CompanyPart = { companyId: string; name: string; result: CompanyResult };

export type GroupResult = Omit<CompanyResult, "locations" | "scope1"> & {
  companies: { companyId: string; name: string; scope1T: number; scope2LocationT: number; scope3T: number | null; energyMWh: number; employees: number }[];
  scope1Lines: CompanyResult["scope1"]["lines"];
};

const sumN = (values: (number | null)[]) => (values.every((v) => v === null) ? null : values.reduce<number>((s, v) => s + (v ?? 0), 0));
const ratio = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);
const addRecord = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
};
const total = (s: EnergySplit) => s.renewable + s.nonRenewable;

export function consolidate(parts: CompanyPart[], opts: { reportingCompanyId: string; consolidatedTurnover?: number | null }): GroupResult {
  const rs = parts.map((p) => p.result);
  const issues: CalcIssue[] = parts.flatMap((p) => p.result.issues.filter((i) => i.level !== "info").map((i) => ({ ...i, message: `${p.name}: ${i.message}` })));
  const sum = (pick: (r: CompanyResult) => number) => rs.reduce((s, r) => s + pick(r), 0);
  const split = (pick: (r: CompanyResult) => EnergySplit) => rs.reduce((s, r) => addSplit(s, pick(r)), emptySplit());

  // Rådata
  const raw: RawFigures = {
    turnover: opts.consolidatedTurnover ?? sumN(rs.map((r) => r.raw.turnover)),
    employees: sumN(rs.map((r) => r.raw.employees)),
    hoursMen: sum((r) => r.raw.hoursMen),
    hoursWomen: sum((r) => r.raw.hoursWomen),
    grossPayMen: sumN(rs.map((r) => r.raw.grossPayMen)),
    grossPayWomen: sumN(rs.map((r) => r.raw.grossPayWomen)),
    coveredByAgreement: sumN(rs.map((r) => r.raw.coveredByAgreement)),
    trainingMen: sumN(rs.map((r) => r.raw.trainingMen)),
    trainingWomen: sumN(rs.map((r) => r.raw.trainingWomen)),
    leavers: sumN(rs.map((r) => r.raw.leavers)),
    employeesStart: sumN(rs.map((r) => r.raw.employeesStart)),
    employeesEnd: sumN(rs.map((r) => r.raw.employeesEnd)),
    managementWomen: sumN(rs.map((r) => r.raw.managementWomen)),
    managementMen: sumN(rs.map((r) => r.raw.managementMen)),
    boardWomen: rs.find((_, i) => parts[i].companyId === opts.reportingCompanyId)?.raw.boardWomen ?? null,
    boardMen: rs.find((_, i) => parts[i].companyId === opts.reportingCompanyId)?.raw.boardMen ?? null,
  };
  if (!opts.consolidatedTurnover && rs.length > 1) {
    issues.push({ level: "info", message: "CO₂e-intensiteten er beregnet på summen af selskabernes omsætning. Angiv koncernens konsoliderede omsætning i rapportopsætningen for at undgå koncerninterne salg." });
  }

  const electricity = split((r) => r.energy.electricity);
  const fuels = split((r) => r.energy.fuels);
  const other = split((r) => r.energy.other);
  const scope1T = sum((r) => r.ghg.scope1T);
  const scope2LocationT = sum((r) => r.ghg.scope2LocationT);
  const scope2MarketT = sum((r) => r.ghg.scope2MarketT);

  // Vand og affald
  const consumption = sumN(rs.map((r) => r.water.consumptionM3));
  const waste = {
    hazardousT: sum((r) => r.waste.hazardousT),
    nonHazardousT: sum((r) => r.waste.nonHazardousT),
    recycledT: sum((r) => r.waste.recycledT),
    disposedT: sum((r) => r.waste.disposedT),
  };
  const wasteTotal = waste.hazardousT + waste.nonHazardousT;

  // Medarbejdere – samme enhed forudsættes
  const units = new Set(rs.map((r) => r.workforce.unit).filter(Boolean));
  if (units.size > 1) issues.push({ level: "missing", message: "Selskaberne opgør ansatte forskelligt (headcount og FTE). Summen blander de to opgørelser." });
  const byGender = rs.reduce((s, r) => addRecord(s, r.workforce.byGender), {} as Record<string, number>);
  const employees = raw.employees ?? 0;
  const hours = raw.hoursMen + raw.hoursWomen;
  const accidents = sumN(rs.map((r) => r.health.accidents));

  // Lønforskel kun ud fra selskaber, der har oplyst lønsummer
  const payParts = rs.filter((r) => r.raw.grossPayMen !== null && r.raw.grossPayWomen !== null);
  const hm = ratio(payParts.reduce((s, r) => s + r.raw.grossPayMen!, 0), payParts.reduce((s, r) => s + r.raw.hoursMen, 0));
  const hf = ratio(payParts.reduce((s, r) => s + r.raw.grossPayWomen!, 0), payParts.reduce((s, r) => s + r.raw.hoursWomen, 0));
  const avg = raw.employeesStart !== null && raw.employeesEnd !== null ? (raw.employeesStart + raw.employeesEnd) / 2 : null;

  const turnover = raw.turnover;
  const totalLocationT = scope1T + scope2LocationT;

  // Scope 3: kun selskaber, der opgør det; linjerne får selskabets navn ved flere selskaber
  const scope3: Scope3Result = emptyScope3();
  for (const p of parts) {
    const s3 = p.result.scope3;
    if (!s3.included) continue;
    scope3.included = true;
    scope3.lines.push(...s3.lines.map((l) => ({ ...l, label: parts.length > 1 ? `${p.name}: ${l.label}` : l.label })));
    for (const [c, t] of Object.entries(s3.byCategory)) scope3.byCategory[Number(c)] = (scope3.byCategory[Number(c)] ?? 0) + t;
    scope3.relevant = [...new Set([...scope3.relevant, ...s3.relevant])].sort((a, b) => a - b);
    scope3.notRelevant = [...new Set([...scope3.notRelevant, ...s3.notRelevant])].filter((c) => !scope3.relevant.includes(c)).sort((a, b) => a - b);
    const prefix = parts.length > 1 ? `${p.name}: ` : "";
    if (s3.exclusionReason) scope3.exclusionReason = [scope3.exclusionReason, prefix + s3.exclusionReason].filter(Boolean).join("\n");
    if (s3.boundary) scope3.boundary = [scope3.boundary, prefix + s3.boundary].filter(Boolean).join("\n");
  }
  scope3.notRelevant = scope3.notRelevant.filter((c) => !scope3.relevant.includes(c));
  scope3.totalT = scope3.lines.reduce((s, l) => s + l.tCO2e, 0);

  return {
    energy: { electricity, fuels, other, total: addSplit(addSplit(electricity, fuels), other) },
    ghg: {
      scope1T,
      scope2LocationT,
      scope2MarketT,
      totalLocationT,
      totalMarketT: scope1T + scope2MarketT,
      outsideScopesT: sum((r) => r.ghg.outsideScopesT),
      intensityPerMDKK: turnover ? totalLocationT / (turnover / 1_000_000) : null,
      scope3T: scope3.included ? scope3.totalT : null,
    },
    scope3,
    water: {
      intakeM3: sum((r) => r.water.intakeM3),
      consumptionM3: consumption,
      consumptionStressM3: sumN(rs.map((r) => r.water.consumptionStressM3)),
    },
    waste: { ...waste, totalT: wasteTotal, recyclingRate: wasteTotal > 0 ? waste.recycledT / wasteTotal : null },
    workforce: {
      unit: units.size === 1 ? [...units][0] : null,
      total: sum((r) => r.workforce.total),
      byContract: rs.reduce((s, r) => addRecord(s, r.workforce.byContract), {} as Record<string, number>),
      byGender,
      byCountry: rs.reduce((s, r) => addRecord(s, r.workforce.byCountry), {} as Record<string, number>),
    },
    health: {
      accidents,
      accidentRate: accidents !== null && hours > 0 ? (accidents / hours) * 200_000 : null,
      fatalitiesAccidents: sumN(rs.map((r) => r.health.fatalitiesAccidents)),
      fatalitiesIllHealth: sumN(rs.map((r) => r.health.fatalitiesIllHealth)),
    },
    pay: {
      payGapPct: hm !== null && hf !== null && hm > 0 ? ((hm - hf) / hm) * 100 : null,
      cbaCoveragePct: raw.coveredByAgreement !== null && employees ? (raw.coveredByAgreement / employees) * 100 : null,
      trainingHoursPerEmployee: raw.trainingMen !== null && raw.trainingWomen !== null && employees ? (raw.trainingMen + raw.trainingWomen) / employees : null,
      trainingMen: raw.trainingMen !== null && byGender.MALE ? raw.trainingMen / byGender.MALE : null,
      trainingWomen: raw.trainingWomen !== null && byGender.FEMALE ? raw.trainingWomen / byGender.FEMALE : null,
    },
    c5: {
      turnoverPct: raw.leavers !== null && avg ? (raw.leavers / avg) * 100 : null,
      managementRatio: ratio(raw.managementWomen, raw.managementMen),
    },
    governance: {
      convictions: sum((r) => r.governance.convictions),
      fines: sum((r) => r.governance.fines),
      boardRatio: ratio(raw.boardWomen, raw.boardMen),
    },
    materials: rs.flatMap((r) => r.materials),
    raw,
    issues,
    companies: parts.map((p) => ({
      companyId: p.companyId,
      name: p.name,
      scope1T: p.result.ghg.scope1T,
      scope2LocationT: p.result.ghg.scope2LocationT,
      scope3T: p.result.ghg.scope3T,
      energyMWh: total(p.result.energy.total),
      employees: p.result.workforce.total,
    })),
    scope1Lines: parts.flatMap((p) => p.result.scope1.lines),
  };
}
