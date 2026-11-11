/**
 * Selskabets nøgletal (B1–B11, C5, C9) ud fra modulsvarene og lokationernes resultater.
 * Alle summer bygger på rådata, så de kan konsolideres ved at summere og genberegne rater.
 */
import { calcLocationEnergy, calcWaste, calcWater, type LocationEnergyResult, type WasteResult, type WaterResult } from "./location";
import { calcScope1, type Scope1Result } from "./scope1";
import { calcScope3, type Scope3Result } from "./scope3";
import { addSplit, emptySplit, totalOf, type CalcIssue, type EnergySplit, type FactorLookup } from "./types";

type Row = Record<string, unknown>;
type Answers = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ratio = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);

export type LocationInput = {
  id: string;
  name: string;
  energy?: Answers;
  water?: Answers;
  waste?: Answers;
  biodiversity?: Answers;
};

export type CompanyInput = {
  modules: Partial<Record<"general" | "workforce" | "health" | "pay" | "governance" | "materials" | "scope1" | "scope3", Answers>>;
  locations: LocationInput[];
};

export type LocationResult = {
  id: string;
  name: string;
  energy: LocationEnergyResult;
  water: WaterResult;
  waste: WasteResult;
  waterStress: boolean;
  scope1T: number;
};

export type CompanyResult = {
  energy: { electricity: EnergySplit; fuels: EnergySplit; other: EnergySplit; total: EnergySplit };
  ghg: { scope1T: number; scope2LocationT: number; scope2MarketT: number; totalLocationT: number; totalMarketT: number; outsideScopesT: number; intensityPerMDKK: number | null; scope3T: number | null };
  scope1: Scope1Result;
  scope3: Scope3Result;
  water: { intakeM3: number; consumptionM3: number | null; consumptionStressM3: number | null };
  waste: WasteResult & { totalT: number; recyclingRate: number | null };
  workforce: { unit: string | null; total: number; byContract: Record<string, number>; byGender: Record<string, number>; byCountry: Record<string, number> };
  health: { accidents: number | null; accidentRate: number | null; fatalitiesAccidents: number | null; fatalitiesIllHealth: number | null };
  pay: { payGapPct: number | null; cbaCoveragePct: number | null; trainingHoursPerEmployee: number | null; trainingMen: number | null; trainingWomen: number | null };
  c5: { turnoverPct: number | null; managementRatio: number | null };
  governance: { convictions: number; fines: number; boardRatio: number | null };
  materials: { material: string; unit: string; amount: number }[];
  locations: LocationResult[];
  /** Rådata bag raterne – summeres ved konsolidering, hvorefter raterne genberegnes */
  raw: RawFigures;
  issues: CalcIssue[];
};

export type RawFigures = {
  turnover: number | null;
  employees: number | null;
  hoursMen: number;
  hoursWomen: number;
  /** Kun når lønforskellen skal oplyses */
  grossPayMen: number | null;
  grossPayWomen: number | null;
  coveredByAgreement: number | null;
  trainingMen: number | null;
  trainingWomen: number | null;
  leavers: number | null;
  employeesStart: number | null;
  employeesEnd: number | null;
  managementWomen: number | null;
  managementMen: number | null;
  boardWomen: number | null;
  boardMen: number | null;
};

function pivot(rows: Row[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key] ?? "–");
    out[k] = (out[k] ?? 0) + (n(r.count) ?? 0);
  }
  return out;
}

export function calcCompany(input: CompanyInput, lookup: FactorLookup): CompanyResult {
  const m = input.modules;
  const issues: CalcIssue[] = [];

  // Lokationer
  const scope1 = calcScope1(m.scope1 ?? {}, lookup);
  issues.push(...scope1.issues);
  const locations: LocationResult[] = input.locations.map((l) => {
    const energy = calcLocationEnergy(l.energy ?? {}, lookup);
    issues.push(...energy.issues.map((i) => ({ ...i, message: `${l.name}: ${i.message}` })));
    return {
      id: l.id,
      name: l.name,
      energy,
      water: calcWater(l.water ?? {}),
      waste: calcWaste(l.waste ?? {}),
      waterStress: l.biodiversity?.waterStress === "YES",
      scope1T: scope1.lines.filter((x) => x.locationId === l.id).reduce((s, x) => s + x.tCO2e, 0),
    };
  });

  // Energi (B3 pkt. 32): elektricitet, brændsler, andet (fjernvarme, damp, køling)
  const sum = (pick: (l: LocationResult) => EnergySplit) => locations.reduce((s, l) => addSplit(s, pick(l)), emptySplit());
  const electricity = addSplit(sum((l) => l.energy.electricity), sum((l) => l.energy.ownElectricity));
  const other = addSplit(sum((l) => l.energy.districtHeating), sum((l) => l.energy.steamCooling));
  const fuels = scope1.fuelsMWh;
  const total = addSplit(addSplit(electricity, fuels), other);

  // Drivhusgasser (B3 pkt. 33)
  const scope2LocationT = locations.reduce((s, l) => s + l.energy.scope2LocationT, 0) + scope1.scope2T;
  const scope2MarketT = locations.reduce((s, l) => s + l.energy.scope2MarketT, 0) + scope1.scope2T;
  const turnover = n(m.general?.turnover);
  const totalLocationT = scope1.tCO2e + scope2LocationT;

  // Scope 3 (frivilligt) – kategori 3 kan beregnes fra de samme faktorer som scope 1 og 2
  const upstreamT = scope1.upstreamT + locations.reduce((s, l) => s + l.energy.upstreamT, 0);
  const scope3 = calcScope3(m.scope3, lookup, upstreamT);
  issues.push(...scope3.issues);
  if (turnover === null) issues.push({ level: "info", message: "CO₂e-intensiteten kræver omsætningen i modul 1." });

  // Vand (B6)
  const withDischarge = locations.filter((l) => l.water.consumptionM3 !== null);
  const water = {
    intakeM3: locations.reduce((s, l) => s + l.water.intakeM3, 0),
    consumptionM3: withDischarge.length ? withDischarge.reduce((s, l) => s + (l.water.consumptionM3 ?? 0), 0) : null,
    consumptionStressM3: withDischarge.some((l) => l.waterStress) ? withDischarge.filter((l) => l.waterStress).reduce((s, l) => s + (l.water.consumptionM3 ?? 0), 0) : null,
  };

  // Affald (B7)
  const waste = locations.reduce<WasteResult>(
    (s, l) => ({ hazardousT: s.hazardousT + l.waste.hazardousT, nonHazardousT: s.nonHazardousT + l.waste.nonHazardousT, recycledT: s.recycledT + l.waste.recycledT, disposedT: s.disposedT + l.waste.disposedT }),
    { hazardousT: 0, nonHazardousT: 0, recycledT: 0, disposedT: 0 },
  );
  const wasteTotal = waste.hazardousT + waste.nonHazardousT;

  // Medarbejdere (B8)
  const wf = Array.isArray(m.workforce?.employees) ? (m.workforce!.employees as Row[]) : [];
  const workforceTotal = wf.reduce((s, r) => s + (n(r.count) ?? 0), 0);
  const employees = workforceTotal || n(m.general?.employees);
  const byGender = pivot(wf, "gender");

  // Arbejdsmiljø (B9) – frekvens pr. 200.000 timer
  const hours = (n(m.pay?.hoursMen) ?? 0) + (n(m.pay?.hoursWomen) ?? 0);
  const accidents = n(m.health?.recordableAccidents);
  if (accidents !== null && hours === 0) issues.push({ level: "info", message: "Ulykkesfrekvensen kræver arbejdstimer i modul 5." });

  // Løn (B10)
  const hourlyM = ratio(n(m.pay?.grossPayMen), n(m.pay?.hoursMen));
  const hourlyF = ratio(n(m.pay?.grossPayWomen), n(m.pay?.hoursWomen));
  const payGapPct = m.pay?.payGapRequired === "yes" && hourlyM !== null && hourlyF !== null && hourlyM > 0 ? ((hourlyM - hourlyF) / hourlyM) * 100 : null;
  const trainingM = n(m.pay?.trainingHoursMen);
  const trainingF = n(m.pay?.trainingHoursWomen);

  // C5 og C9
  const start = n(m.workforce?.employeesStart);
  const end = n(m.workforce?.employeesEnd);
  const avg = start !== null && end !== null ? (start + end) / 2 : null;

  return {
    energy: { electricity, fuels, other, total },
    ghg: {
      scope1T: scope1.tCO2e,
      scope2LocationT,
      scope2MarketT,
      totalLocationT,
      totalMarketT: scope1.tCO2e + scope2MarketT,
      outsideScopesT: scope1.outsideT,
      intensityPerMDKK: turnover ? totalLocationT / (turnover / 1_000_000) : null,
      scope3T: scope3.included ? scope3.totalT : null,
    },
    scope1,
    scope3,
    water,
    waste: { ...waste, totalT: wasteTotal, recyclingRate: wasteTotal > 0 ? waste.recycledT / wasteTotal : null },
    workforce: { unit: (m.workforce?.unit as string) ?? null, total: workforceTotal, byContract: pivot(wf, "contract"), byGender, byCountry: pivot(wf, "country") },
    health: {
      accidents,
      accidentRate: accidents !== null && hours > 0 ? (accidents / hours) * 200_000 : null,
      fatalitiesAccidents: n(m.health?.fatalitiesAccidents),
      fatalitiesIllHealth: n(m.health?.fatalitiesIllHealth),
    },
    pay: {
      payGapPct,
      cbaCoveragePct: n(m.pay?.coveredByAgreement) !== null && employees ? (n(m.pay?.coveredByAgreement)! / employees) * 100 : null,
      trainingHoursPerEmployee: trainingM !== null && trainingF !== null && employees ? (trainingM + trainingF) / employees : null,
      trainingMen: trainingM !== null && byGender.MALE ? trainingM / byGender.MALE : null,
      trainingWomen: trainingF !== null && byGender.FEMALE ? trainingF / byGender.FEMALE : null,
    },
    c5: {
      turnoverPct: n(m.workforce?.leavers) !== null && avg ? (n(m.workforce?.leavers)! / avg) * 100 : null,
      managementRatio: ratio(n(m.workforce?.managementWomen), n(m.workforce?.managementMen)),
    },
    governance: {
      convictions: m.governance?.hadConvictions === "yes" ? (n(m.governance?.convictions) ?? 0) : 0,
      fines: m.governance?.hadConvictions === "yes" ? (n(m.governance?.fines) ?? 0) : 0,
      boardRatio: m.governance?.hasBoard === "yes" ? ratio(n(m.governance?.boardWomen), n(m.governance?.boardMen)) : null,
    },
    materials:
      m.materials?.significantMaterialFlows === "yes" && Array.isArray(m.materials?.materials)
        ? (m.materials!.materials as Row[]).filter((r) => n(r.amount) !== null).map((r) => ({ material: String(r.material ?? "–"), unit: String(r.unit ?? ""), amount: r.amount as number }))
        : [],
    locations,
    raw: {
      turnover,
      employees,
      hoursMen: n(m.pay?.hoursMen) ?? 0,
      hoursWomen: n(m.pay?.hoursWomen) ?? 0,
      grossPayMen: m.pay?.payGapRequired === "yes" ? n(m.pay?.grossPayMen) : null,
      grossPayWomen: m.pay?.payGapRequired === "yes" ? n(m.pay?.grossPayWomen) : null,
      coveredByAgreement: n(m.pay?.coveredByAgreement),
      trainingMen: trainingM,
      trainingWomen: trainingF,
      leavers: n(m.workforce?.leavers),
      employeesStart: start,
      employeesEnd: end,
      managementWomen: n(m.workforce?.managementWomen),
      managementMen: n(m.workforce?.managementMen),
      boardWomen: m.governance?.hasBoard === "yes" ? n(m.governance?.boardWomen) : null,
      boardMen: m.governance?.hasBoard === "yes" ? n(m.governance?.boardMen) : null,
    },
    issues,
  };
}

export { totalOf };
