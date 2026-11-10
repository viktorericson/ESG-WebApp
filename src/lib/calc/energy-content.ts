/**
 * Brændværdier (nedre) til omregning af brændsler til energi (MWh).
 *
 * Kilde: Energistyrelsen, "Standardfaktorer for brændværdier og CO2-emissionsfaktorer til brug for
 * rapporteringsåret 2024" (https://ens.dk/media/1031/download). Gas: GJ/m3(ref) – anvendes for både m3 og Nm3.
 *
 * Værdier markeret "afledt" findes ikke direkte i kilden:
 *  - LPG/propan pr. liter: densitet afledt af forholdet mellem Klimakompassets faktorer pr. liter og pr. ton.
 *  - Propan: ENS angiver kun LPG (propan/butan), som anvendes.
 *  - Fuelolie pr. liter: afledt af Klimakompassets scope 1-faktor pr. liter ÷ ENS' emissionsfaktor (78,95 kg CO2/GJ).
 *  - HVO: ENS' værdi for "bioolie og anden flydende biobrændsel" (34,3 GJ/m3).
 */
export const GJ_PER_MWH = 3.6;

type Content = { gjPerUnit: Record<string, number>; renewable: number; note?: string };

export const ENERGY_CONTENT: Record<string, Content> = {
  Naturgas: { gjPerUnit: { m3: 0.0396, Nm3: 0.0396 }, renewable: 0 },
  Ledningsgas: { gjPerUnit: { m3: 0.0396, Nm3: 0.0396 }, renewable: 0 }, // vedvarende andel afledes af biogen andel i faktoren
  Biogas: { gjPerUnit: { m3: 0.023, Nm3: 0.023 }, renewable: 1 },
  Fyringsolie: { gjPerUnit: { L: 0.03587, m3: 35.87 }, renewable: 0 },
  Diesel: { gjPerUnit: { L: 0.03587, m3: 35.87 }, renewable: 0 },
  Benzin: { gjPerUnit: { L: 0.03285, m3: 32.85 }, renewable: 0 },
  Fuelolie: { gjPerUnit: { ton: 40.47, L: 0.04003 }, renewable: 0, note: "liter afledt" },
  LPG: { gjPerUnit: { ton: 46.0, L: 0.02484 }, renewable: 0, note: "liter afledt" },
  Propan: { gjPerUnit: { ton: 46.0, L: 0.02369 }, renewable: 0, note: "LPG-værdi, liter afledt" },
  Halm: { gjPerUnit: { ton: 14.5 }, renewable: 1 },
  Træpiller: { gjPerUnit: { ton: 17.5 }, renewable: 1 },
  Træflis: { gjPerUnit: { ton: 10.4 }, renewable: 1 },
  HVO: { gjPerUnit: { L: 0.0343 }, renewable: 1, note: "bioolie-værdi" },
};

/** MWh for en brændselsmængde, eller null hvis brændværdien ikke kendes */
export function fuelMWh(fuel: string, unit: string, amount: number): number | null {
  const c = ENERGY_CONTENT[fuel];
  const gj = c?.gjPerUnit[unit === "Ton" ? "ton" : unit];
  return gj === undefined ? null : (amount * gj) / GJ_PER_MWH;
}

/** Energienheder → MWh */
export function energyToMWh(value: number, unit: string | null | undefined): number | null {
  switch (unit) {
    case "kWh":
      return value / 1000;
    case "MWh":
      return value;
    case "GJ":
      return value / GJ_PER_MWH;
    default:
      return null;
  }
}
