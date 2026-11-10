/**
 * Oversættelse fra appens svar til Klimakompassets faktornøgler.
 * Egne faktorsæt er kopier af et globalt sæt og bruger samme nøgler.
 */
const DK = "Danmark";
const norm = (s: string) => s.replace(/\s/g, "");

export const electricityKey = (method: "Miljødeklaration" | "Eldeklaration") => `Energi&Processer_Elektricitet_${method}_${DK}_MWh`;
export const districtHeatingKey = () => `Energi&Processer_Varmeogprocesenergi_Fjernvarme_Fjernvarme_${DK}_MWh`;

const STATIONARY: Record<string, string> = {
  Naturgas: "Brændsler_Naturgas(0%biogas)",
  Ledningsgas: "Brændsler_Ledningsgas",
  Biogas: "Brændsler_Biogas",
  Fyringsolie: "Brændsler_Fyringsolie",
  Fuelolie: "Brændsler_Fuelolie",
  Halm: "Brændsler_Halm",
  Træflis: "Brændsler_Træflis",
  Træpiller: "Brændsler_Træpiller",
  LPG: "Brændsler_LPG",
  Propan: "Brændsler_Propan",
  Benzin: "Benzin",
  Diesel: "Diesel",
};

/** Stationær forbrænding. Klimakompasset bruger "Ton" med stort T. */
export function stationaryKey(fuel: string, unit: string): string | null {
  const part = STATIONARY[fuel];
  if (!part) return null;
  return `Energi&Processer_Varmeogprocesenergi_${part}_${DK}_${unit === "ton" ? "Ton" : unit}`;
}

/** Køretøjstype i appen → [Klimakompasset-gruppe, drivmiddel, brændsel til energiberegning] */
const VEHICLES: Record<string, { group: string | null; fuel: string; energyFuel: string | null; electric?: boolean }> = {
  "Personbil (benzin)": { group: "Personbiler", fuel: "Benzin", energyFuel: "Benzin" },
  "Personbil (diesel)": { group: "Personbiler", fuel: "Diesel", energyFuel: "Diesel" },
  "Personbil (el)": { group: "Personbiler", fuel: "Elektricitet", energyFuel: null, electric: true },
  "Personbil (hybrid, ikke plug-in)": { group: "Personbiler", fuel: "Hybrid(ikkeopladnings-hybrid)", energyFuel: "Benzin" },
  "Varebil (benzin)": { group: "Varebiler", fuel: "Benzin", energyFuel: "Benzin" },
  "Varebil (diesel)": { group: "Varebiler", fuel: "Diesel", energyFuel: "Diesel" },
  "Varebil (el)": { group: "Varebiler", fuel: "Elektricitet", energyFuel: null, electric: true },
  "Lastbil (diesel)": { group: "Lastbiler", fuel: "Diesel", energyFuel: "Diesel" },
  "Lastbil (biodiesel/HVO)": { group: "Lastbiler", fuel: "BiodieselHVO", energyFuel: "HVO" },
  "Lastbil (CNG)": { group: "Lastbiler", fuel: "CNG", energyFuel: null },
  "Lastbil (CBG/biogas)": { group: "Lastbiler", fuel: "CBG", energyFuel: null },
  "Lastbil (LNG)": { group: "Lastbiler", fuel: "LNG", energyFuel: null },
  "Lastbil (LBG)": { group: "Lastbiler", fuel: "LBG", energyFuel: null },
  "Lastbil (LPG)": { group: "Lastbiler", fuel: "LPG", energyFuel: "LPG" },
  "Bus (diesel)": { group: "Busser", fuel: "Diesel", energyFuel: "Diesel" },
  "Motorcykel (benzin)": { group: "Motorcykler", fuel: "Benzin", energyFuel: "Benzin" },
  // Ingen egen køretøjsgruppe i Klimakompasset – bruger drivmiddelfaktoren (kun liter)
  "Entreprenør-/arbejdsmaskine (diesel)": { group: null, fuel: "Diesel", energyFuel: "Diesel" },
  "Truck/gaffeltruck (diesel)": { group: null, fuel: "Diesel", energyFuel: "Diesel" },
  "Truck/gaffeltruck (LPG)": { group: null, fuel: "LPG", energyFuel: "LPG" },
};

export const vehicleInfo = (type: string) => VEHICLES[type];

export function vehicleKey(type: string, unit: string): string | null {
  const v = VEHICLES[type];
  if (!v) return null;
  if (!v.group) return unit === "L" ? `Transport_Drivmiddel_${v.fuel}_${DK}_L` : null;
  return `Transport_Egneogleasedetransportmidler_${v.group}_${v.fuel}_${DK}_${unit === "ton" ? "Ton" : unit}`;
}

/** Literfaktoren for samme køretøj – bruges til at omregne km til liter (energi) */
export const vehicleLitreKey = (type: string) => vehicleKey(type, "L");
export const vehicleKwhKey = (type: string) => vehicleKey(type, "kWh");

/** Appens gasnavne → Klimakompassets nøgledel (inkl. kemisk formel; N2O staves "N20" i arket) */
const GAS_KEYS: Record<string, string> = {
  CO2: "CO2",
  CH4: "CH4",
  N2O: "N20",
  SF6: "SF6",
  NF3: "NF3",
  "HFC-23": "HFC-23(CHF3)",
  "HFC-32": "HFC-32(CH2F2)",
  "HFC-41": "HFC-41(CH3F)",
  "HFC-125": "HFC-125(C2HF5)",
  "HFC-134": "HFC-134(C2H2F4)",
  "HFC-134a": "HFC-134a(C2H2F4)",
  "HFC-143": "HFC-143(C2H3F3)",
  "HFC-143a": "HFC-143a(C2H3F3)",
  "HFC-152a": "HFC-152a(C2H4F2)",
  "HFC-227ea": "HFC-227ea(C3HF7)",
  "HFC-236fa": "HFC-236fa(C3H2F6)",
  "HFC-245ca": "HFC-245ca(C3H3F5)",
  "HFC-43-10mee": "HFC-43-10mee(C5H2F10)",
  "PFC-14 (CF4)": "PFC-14(CF4)",
  "PFC-116 (C2F6)": "PFC-116(C2F6)",
  "PFC-218 (C3F8)": "PFC-218(C3F8)",
  "PFC-318 (c-C4F8)": "PFC-318(c-C4F8)",
  "PFC-31-10 (C4F10)": "PFC-31-10(C4F10)",
  "PFC-41-12 (C5F12)": "PFC-41-12(C5F12)",
  "PFC-51-14 (C6F14)": "PFC-51-14(C6F14)",
};

export function gasKey(gas: string): string | null {
  const part = GAS_KEYS[gas];
  return part ? `Energi&Processer_Procesudledning_${norm(part)}_${DK}_kg` : null;
}

/**
 * Kølemiddelblandinger som masseandele af komponenter (ASHRAE Standard 34).
 * GWP beregnes af faktorsættets komponent-GWP'er. HFO'er (R-1234yf/ze), isobutan og propan
 * har GWP tæt på 0 og regnes som 0. Ammoniak (R-717) har GWP 0.
 */
export const REFRIGERANT_BLENDS: Record<string, [gas: string, share: number][]> = {
  "R-32": [["HFC-32", 1]],
  "R-134a": [["HFC-134a", 1]],
  "R-404A": [["HFC-125", 0.44], ["HFC-143a", 0.52], ["HFC-134a", 0.04]],
  "R-407C": [["HFC-32", 0.23], ["HFC-125", 0.25], ["HFC-134a", 0.52]],
  "R-410A": [["HFC-32", 0.5], ["HFC-125", 0.5]],
  "R-422D": [["HFC-125", 0.651], ["HFC-134a", 0.315]],
  "R-448A": [["HFC-32", 0.26], ["HFC-125", 0.26], ["HFC-134a", 0.21]],
  "R-449A": [["HFC-32", 0.243], ["HFC-125", 0.247], ["HFC-134a", 0.257]],
  "R-452A": [["HFC-32", 0.11], ["HFC-125", 0.59]],
  "R-507A": [["HFC-125", 0.5], ["HFC-143a", 0.5]],
  "R-744 (CO2)": [["CO2", 1]],
  "R-290 (propan)": [],
  "R-717 (ammoniak)": [],
};
