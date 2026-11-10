/**
 * Lokationsberegninger: energi og scope 2 (B3), vand (B6) og affald (B7).
 */
import { energyToMWh } from "./energy-content";
import { districtHeatingKey, electricityKey } from "./factor-keys";
import { emptySplit, type CalcIssue, type EnergySplit, type FactorLookup } from "./types";

type Row = Record<string, unknown>;
type Q = { value?: unknown; unit?: unknown } | undefined;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const qMWh = (q: Q) => (q && n(q.value) !== null ? energyToMWh(q.value as number, q.unit as string) : null);

export type LocationEnergyResult = {
  electricity: EnergySplit;
  ownElectricity: EnergySplit;
  districtHeating: EnergySplit;
  steamCooling: EnergySplit;
  scope2LocationT: number;
  scope2MarketT: number;
  issues: CalcIssue[];
};

export function calcLocationEnergy(a: Row, lookup: FactorLookup): LocationEnergyResult {
  const issues: CalcIssue[] = [];
  const r: LocationEnergyResult = {
    electricity: emptySplit(),
    ownElectricity: emptySplit(),
    districtHeating: emptySplit(),
    steamCooling: emptySplit(),
    scope2LocationT: 0,
    scope2MarketT: 0,
    issues,
  };

  if (a.buysElectricity === "yes") {
    const mwh = qMWh(a.electricity as Q);
    if (mwh !== null) {
      const go = a.hasGuaranteesOfOrigin === "yes" ? Math.min(Math.max(n(a.goShare) ?? 0, 0), 100) / 100 : 0;
      // Vedvarende: kun el dækket af oprindelsesgarantier (konservativt – nettets VE-andel tælles ikke med)
      r.electricity = { renewable: mwh * go, nonRenewable: mwh * (1 - go) };
      const loc = lookup(electricityKey("Miljødeklaration"));
      const mkt = lookup(electricityKey("Eldeklaration"));
      if (loc) r.scope2LocationT += (mwh * loc.scope2) / 1000;
      else issues.push({ level: "missing", message: "Faktor for el (Miljødeklaration) mangler i faktorsættet." });
      if (mkt) r.scope2MarketT += (mwh * (1 - go) * mkt.scope2) / 1000;
      else issues.push({ level: "missing", message: "Faktor for el (Eldeklaration) mangler i faktorsættet." });
    }
  }

  if (a.usesOwnElectricity === "yes") {
    const mwh = qMWh(a.ownElectricityAmount as Q);
    if (mwh !== null) r.ownElectricity = { renewable: mwh, nonRenewable: 0 };
  }

  if (a.buysDistrictHeating === "yes") {
    const mwh = qMWh(a.districtHeatingAmount as Q);
    if (mwh !== null) {
      const share = Math.min(Math.max(n(a.districtHeatingRenewableShare) ?? 0, 0), 100) / 100;
      r.districtHeating = { renewable: mwh * share, nonRenewable: mwh * (1 - share) };
      const f = lookup(districtHeatingKey());
      if (f) r.scope2LocationT += (mwh * f.scope2) / 1000;
      else issues.push({ level: "missing", message: "Faktor for fjernvarme mangler i faktorsættet." });
      const supplier = n(a.districtHeatingFactor);
      r.scope2MarketT += (mwh * (supplier ?? f?.scope2 ?? 0)) / 1000;
    }
  }

  if (a.buysSteamCooling === "yes") {
    const list = Array.isArray(a.steamCoolingList) ? (a.steamCoolingList as Row[]) : [];
    let mwhTotal = 0;
    for (const row of list) {
      const mwh = n(row.amount) !== null ? energyToMWh(row.amount as number, row.unit as string) : null;
      if (mwh !== null) mwhTotal += mwh;
    }
    if (mwhTotal > 0) {
      r.steamCooling = { renewable: 0, nonRenewable: mwhTotal };
      issues.push({ level: "missing", message: "Klimakompasset har ingen faktor for damp og fjernkøling. Energien er medtaget, men ikke udledningen." });
    }
  }

  return r;
}

export type WaterResult = { intakeM3: number; dischargeM3: number | null; consumptionM3: number | null };

const m3 = (q: Q) => (q && n(q.value) !== null ? (q.unit === "L" ? (q.value as number) / 1000 : (q.value as number)) : null);

export function calcWater(a: Row): WaterResult {
  const intake = (a.buysWater === "yes" ? (m3(a.waterIntake as Q) ?? 0) : 0) + (a.usesRainwater === "yes" ? (m3(a.rainwater as Q) ?? 0) : 0);
  const discharge = a.significantConsumption === "yes" ? m3(a.waterDischarge as Q) : null;
  return { intakeM3: intake, dischargeM3: discharge, consumptionM3: discharge !== null ? Math.max(intake - discharge, 0) : null };
}

export type WasteResult = { hazardousT: number; nonHazardousT: number; recycledT: number; disposedT: number };

export function calcWaste(a: Row): WasteResult {
  const out: WasteResult = { hazardousT: 0, nonHazardousT: 0, recycledT: 0, disposedT: 0 };
  if (a.householdOnly !== "no") return out;
  for (const r of Array.isArray(a.wasteRows) ? (a.wasteRows as Row[]) : []) {
    const toT = (v: unknown) => (n(v) === null ? 0 : r.unit === "kg" ? (v as number) / 1000 : (v as number));
    const g = toT(r.generated);
    if (r.hazardous === "HAZARDOUS") out.hazardousT += g;
    else out.nonHazardousT += g;
    out.recycledT += toT(r.recycled);
    out.disposedT += toT(r.disposed);
  }
  return out;
}
