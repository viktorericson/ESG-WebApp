/**
 * Scope 1 (B3 pkt. 33) og energi fra brændsler (pkt. 32) ud fra selskabets Scope 1-modul.
 */
import { energyToMWh, fuelMWh } from "./energy-content";
import { gasKey, REFRIGERANT_BLENDS, stationaryKey, vehicleInfo, vehicleKey, vehicleKwhKey, vehicleLitreKey } from "./factor-keys";
import { addSplit, emptySplit, type CalcIssue, type EnergySplit, type FactorLookup } from "./types";

type Row = Record<string, unknown>;
const rows = (a: Row, key: string) => (Array.isArray(a[key]) ? (a[key] as Row[]) : []);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export type Scope1Line = {
  category: "Køretøjer" | "Stationær forbrænding" | "Kølemidler" | "Procesudledninger";
  label: string;
  locationId: string | null;
  tCO2e: number;
  /** Scope 2 – kun el til elkøretøjer ladet uden for selskabets lokationer */
  scope2T: number;
  /** Biogen CO2 (udenfor scopes) */
  outsideT: number;
  mwh: EnergySplit;
};

export type Scope1Result = { lines: Scope1Line[]; tCO2e: number; scope2T: number; outsideT: number; fuelsMWh: EnergySplit; issues: CalcIssue[] };

/** Vedvarende andel for ledningsgas afledt af faktorens biogene andel (udenfor scopes) */
function biogenicShare(f: { scope1: number; outsideScopes: number }) {
  const total = f.scope1 + f.outsideScopes;
  return total > 0 ? f.outsideScopes / total : 0;
}

export function calcScope1(a: Row, lookup: FactorLookup): Scope1Result {
  const lines: Scope1Line[] = [];
  const issues: CalcIssue[] = [];
  const miss = (msg: string) => issues.push({ level: "missing", message: msg });

  // Mobil forbrænding
  if (a.hasVehicles === "yes") {
    for (const r of rows(a, "vehicles")) {
      const type = String(r.vehicleType ?? "");
      const unit = String(r.unit ?? "");
      const amount = n(r.amount);
      if (!type || !unit || amount === null) continue;
      const key = vehicleKey(type, unit);
      const f = key ? lookup(key) : undefined;
      const label = `${type}: ${amount.toLocaleString("da-DK")} ${unit}`;
      if (!f) {
        miss(`Ingen faktor for “${type}” i enheden ${unit}. Angiv mængden i liter eller km.`);
        continue;
      }
      const info = vehicleInfo(type);
      let mwh = emptySplit();
      if (info?.electric) {
        // Elkøretøjer: el ladet uden for selskabets lokationer – energi i kWh (eller afledt fra km)
        const kwhF = lookup(vehicleKwhKey(type) ?? "");
        const kwh = unit === "kWh" ? amount : kwhF && kwhF.scope2 > 0 ? (amount * f.scope2) / kwhF.scope2 : null;
        if (kwh !== null) mwh = { renewable: 0, nonRenewable: energyToMWh(kwh, "kWh")! };
      } else if (info?.energyFuel) {
        let litres: number | null = unit === "L" ? amount : null;
        if (unit === "km") {
          const lf = lookup(vehicleLitreKey(type) ?? "");
          litres = lf && lf.scope1 > 0 ? (amount * f.scope1) / lf.scope1 : null;
          if (litres !== null) issues.push({ level: "estimate", message: `Energiforbrug for “${type}” er estimeret ud fra kørte km.` });
        }
        const e = litres !== null ? fuelMWh(info.energyFuel, "L", litres) : null;
        if (e !== null) mwh = info.energyFuel === "HVO" ? { renewable: e, nonRenewable: 0 } : { renewable: 0, nonRenewable: e };
        else issues.push({ level: "missing", message: `Energiindholdet for “${type}” kan ikke beregnes (${unit}). Udledningen er medtaget.` });
      } else {
        issues.push({ level: "missing", message: `Energiindholdet for “${type}” kan ikke beregnes. Udledningen er medtaget.` });
      }
      lines.push({
        category: "Køretøjer",
        label,
        locationId: (r.location as string) ?? null,
        tCO2e: (amount * f.scope1) / 1000,
        scope2T: (amount * f.scope2) / 1000,
        outsideT: (amount * f.outsideScopes) / 1000,
        mwh,
      });
    }
  }

  // Stationær forbrænding
  if (a.hasStationary === "yes") {
    for (const r of rows(a, "stationarySources")) {
      const fuel = String(r.fuel ?? "");
      const unit = String(r.unit ?? "");
      const amount = n(r.amount);
      if (!fuel || !unit || amount === null) continue;
      const label = `${[r.description, fuel].filter(Boolean).join(" · ")}: ${amount.toLocaleString("da-DK")} ${unit}`;
      const f = lookup(stationaryKey(fuel, unit) ?? "");
      if (!f) {
        miss(`Ingen faktor for “${fuel}” i enheden ${unit}.`);
        continue;
      }
      let scope1 = f.scope1;
      let outside = f.outsideScopes;
      let renewableShare = fuel === "Ledningsgas" ? biogenicShare(f) : ["Biogas", "Halm", "Træpiller", "Træflis"].includes(fuel) ? 1 : 0;
      // Naturgas med dokumenteret biogasandel: blanding af Klimakompassets faktorer for naturgas (0 % biogas) og biogas
      const share = fuel === "Naturgas" ? n(r.biogasShare) : null;
      if (share !== null && share > 0) {
        const bio = lookup(stationaryKey("Biogas", unit) ?? "");
        if (bio) {
          const s = Math.min(share, 100) / 100;
          scope1 = (1 - s) * f.scope1 + s * bio.scope1;
          outside = (1 - s) * f.outsideScopes + s * bio.outsideScopes;
          renewableShare = s;
        }
      }
      const e = fuelMWh(fuel, unit, amount);
      if (e === null) issues.push({ level: "missing", message: `Brændværdi for “${fuel}” (${unit}) kendes ikke. Udledningen er medtaget.` });
      lines.push({
        category: "Stationær forbrænding",
        label,
        locationId: (r.location as string) ?? null,
        tCO2e: (amount * scope1) / 1000,
        scope2T: 0,
        outsideT: (amount * outside) / 1000,
        mwh: e === null ? emptySplit() : { renewable: e * renewableShare, nonRenewable: e * (1 - renewableShare) },
      });
    }
  }

  // Kølemidler (påfyldt mængde = lækage)
  if (a.hasRefrigerantLeaks === "yes") {
    for (const r of rows(a, "refrigerantLeaks")) {
      const ref = String(r.refrigerant ?? "");
      const kg = n(r.kg);
      if (!ref || kg === null) continue;
      const blend = REFRIGERANT_BLENDS[ref];
      if (!blend) {
        miss(`Kølemidlet “${ref}” har ingen kendt sammensætning. Indrapportér det som procesudledning med den aktuelle gas.`);
        continue;
      }
      let gwp = 0;
      let ok = true;
      for (const [gas, part] of blend) {
        const f = lookup(gasKey(gas) ?? "");
        if (!f) ok = false;
        else gwp += part * f.scope1;
      }
      if (!ok) {
        miss(`Manglende GWP-værdi for en komponent i “${ref}”.`);
        continue;
      }
      lines.push({ category: "Kølemidler", label: `${ref}: ${kg.toLocaleString("da-DK")} kg`, locationId: (r.location as string) ?? null, tCO2e: (kg * gwp) / 1000, scope2T: 0, outsideT: 0, mwh: emptySplit() });
    }
  }

  // Procesudledninger
  if (a.hasProcessEmissions === "yes") {
    for (const r of rows(a, "processEmissions")) {
      const gas = String(r.gas ?? "");
      const amount = n(r.amount);
      if (!gas || amount === null) continue;
      const kg = r.unit === "ton" ? amount * 1000 : amount;
      const f = lookup(gasKey(gas) ?? "");
      if (!f) {
        miss(`Ingen GWP-værdi for “${gas}”.`);
        continue;
      }
      lines.push({ category: "Procesudledninger", label: `${gas}: ${amount.toLocaleString("da-DK")} ${r.unit ?? "kg"}`, locationId: (r.location as string) ?? null, tCO2e: (kg * f.scope1) / 1000, scope2T: 0, outsideT: 0, mwh: emptySplit() });
    }
  }

  return {
    lines,
    tCO2e: lines.reduce((s, l) => s + l.tCO2e, 0),
    scope2T: lines.reduce((s, l) => s + l.scope2T, 0),
    outsideT: lines.reduce((s, l) => s + l.outsideT, 0),
    fuelsMWh: lines.reduce((s, l) => addSplit(s, l.mwh), emptySplit()),
    issues,
  };
}
