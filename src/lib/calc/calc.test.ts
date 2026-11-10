import { describe, expect, it } from "vitest";
import { calcCompany } from "./company";
import { districtHeatingKey, electricityKey, gasKey, stationaryKey, vehicleKey } from "./factor-keys";
import { calcLocationEnergy, calcWaste, calcWater } from "./location";
import { calcScope1 } from "./scope1";
import type { FactorLookup, FactorValue } from "./types";

// Klimakompassets faktorer for 2024 (emissionsfaktorark 2015-2035, 2024 v5)
const f = (scope1: number, scope2 = 0, outsideScopes = 0, unit = ""): FactorValue => ({ scope1, scope2, scope3: 0, outsideScopes, unit });
const FACTORS: Record<string, FactorValue> = {
  [electricityKey("Miljødeklaration")]: f(0, 40.418885195221726),
  [electricityKey("Eldeklaration")]: f(0, 443.045),
  [districtHeatingKey()]: f(0, 44.93775567103974),
  [stationaryKey("Naturgas", "m3")!]: f(2.2006323100671144),
  [stationaryKey("Biogas", "m3")!]: f(0.0014055555555555555, 0, 1.2715199246770834),
  [stationaryKey("Ledningsgas", "m3")!]: f(1.1230112003564505, 0, 0.6230447630917709),
  [stationaryKey("Træpiller", "ton")!]: f(20.58, 0, 1704.5),
  [vehicleKey("Personbil (diesel)", "L")!]: f(2.5122690680286643),
  [vehicleKey("Personbil (diesel)", "km")!]: f(0.13417),
  [vehicleKey("Personbil (el)", "kWh")!]: f(0, 0.04041888519522173),
  [gasKey("HFC-125")!]: f(3740),
  [gasKey("HFC-143a")!]: f(5810),
  [gasKey("HFC-134a")!]: f(1530),
  [gasKey("SF6")!]: f(24300),
};
const lookup: FactorLookup = (key) => FACTORS[key];

describe("nøgleformat", () => {
  it("matcher Klimakompassets nøgler", () => {
    expect(electricityKey("Miljødeklaration")).toBe("Energi&Processer_Elektricitet_Miljødeklaration_Danmark_MWh");
    expect(stationaryKey("Naturgas", "m3")).toBe("Energi&Processer_Varmeogprocesenergi_Brændsler_Naturgas(0%biogas)_Danmark_m3");
    expect(stationaryKey("Træpiller", "ton")).toBe("Energi&Processer_Varmeogprocesenergi_Brændsler_Træpiller_Danmark_Ton");
    expect(vehicleKey("Truck/gaffeltruck (diesel)", "L")).toBe("Transport_Drivmiddel_Diesel_Danmark_L");
    expect(vehicleKey("Truck/gaffeltruck (diesel)", "km")).toBeNull();
    expect(gasKey("N2O")).toBe("Energi&Processer_Procesudledning_N20_Danmark_kg");
  });
});

describe("lokation: el og fjernvarme (scope 2)", () => {
  it("lokationsbaseret = Miljødeklaration, markedsbaseret = Eldeklaration", () => {
    const r = calcLocationEnergy({ buysElectricity: "yes", electricity: { value: 185000, unit: "kWh" }, hasGuaranteesOfOrigin: "no" }, lookup);
    expect(r.scope2LocationT).toBeCloseTo(7.47749, 4);
    expect(r.scope2MarketT).toBeCloseTo(81.96333, 4);
    expect(r.electricity).toEqual({ renewable: 0, nonRenewable: 185 });
  });

  it("oprindelsesgarantier reducerer markedsbaseret og tæller som vedvarende", () => {
    const r = calcLocationEnergy({ buysElectricity: "yes", electricity: { value: 185, unit: "MWh" }, hasGuaranteesOfOrigin: "yes", goShare: 50 }, lookup);
    expect(r.scope2MarketT).toBeCloseTo(40.98166, 4);
    expect(r.scope2LocationT).toBeCloseTo(7.47749, 4);
    expect(r.electricity.renewable).toBeCloseTo(92.5);
  });

  it("fjernvarme med leverandørfaktor påvirker kun markedsbaseret", () => {
    const r = calcLocationEnergy({ buysDistrictHeating: "yes", districtHeatingAmount: { value: 1152, unit: "GJ" }, districtHeatingFactor: 20, districtHeatingRenewableShare: 60 }, lookup);
    expect(r.scope2LocationT).toBeCloseTo(14.38008, 4); // 320 MWh
    expect(r.scope2MarketT).toBeCloseTo(6.4, 6);
    expect(r.districtHeating.renewable).toBeCloseTo(192);
  });

  it("egenproduceret el er vedvarende og uden udledning", () => {
    const r = calcLocationEnergy({ usesOwnElectricity: "yes", ownElectricityAmount: { value: 50, unit: "MWh" } }, lookup);
    expect(r.ownElectricity).toEqual({ renewable: 50, nonRenewable: 0 });
    expect(r.scope2LocationT).toBe(0);
  });
});

describe("scope 1", () => {
  it("naturgas med biogasandel blandes; energi efter ENS-brændværdi", () => {
    const r = calcScope1({ hasStationary: "yes", stationarySources: [{ fuel: "Naturgas", unit: "m3", amount: 12500, biogasShare: 25 }] }, lookup);
    expect(r.tCO2e).toBeCloseTo(20.63532, 4);
    expect(r.fuelsMWh.renewable + r.fuelsMWh.nonRenewable).toBeCloseTo(137.5, 6);
    expect(r.fuelsMWh.renewable).toBeCloseTo(34.375, 6);
  });

  it("træpiller: lille scope 1, biogen CO2 udenfor scopes, vedvarende energi", () => {
    const r = calcScope1({ hasStationary: "yes", stationarySources: [{ fuel: "Træpiller", unit: "ton", amount: 10 }] }, lookup);
    expect(r.tCO2e).toBeCloseTo(0.2058, 6);
    expect(r.outsideT).toBeCloseTo(17.045, 6);
    expect(r.fuelsMWh).toEqual({ renewable: (10 * 17.5) / 3.6, nonRenewable: 0 });
  });

  it("ledningsgas: vedvarende andel afledes af biogen andel", () => {
    const r = calcScope1({ hasStationary: "yes", stationarySources: [{ fuel: "Ledningsgas", unit: "m3", amount: 1000 }] }, lookup);
    const share = 0.6230447630917709 / (0.6230447630917709 + 1.1230112003564505);
    expect(r.fuelsMWh.renewable / (r.fuelsMWh.renewable + r.fuelsMWh.nonRenewable)).toBeCloseTo(share, 6);
  });

  it("køretøjer i liter og km (km omregnes til liter for energi)", () => {
    const r = calcScope1(
      {
        hasVehicles: "yes",
        vehicles: [
          { vehicleType: "Personbil (diesel)", unit: "L", amount: 1000 },
          { vehicleType: "Personbil (diesel)", unit: "km", amount: 10000 },
        ],
      },
      lookup,
    );
    expect(r.tCO2e).toBeCloseTo(2.512269 + 1.3417, 5);
    expect(r.fuelsMWh.nonRenewable).toBeCloseTo((1000 * 0.03587) / 3.6 + ((10000 * 0.13417) / 2.5122690680286643) * 0.03587 / 3.6, 5);
    expect(r.issues.some((i) => i.level === "estimate")).toBe(true);
  });

  it("elkøretøjer giver scope 2, ikke scope 1", () => {
    const r = calcScope1({ hasVehicles: "yes", vehicles: [{ vehicleType: "Personbil (el)", unit: "kWh", amount: 10000 }] }, lookup);
    expect(r.tCO2e).toBe(0);
    expect(r.scope2T).toBeCloseTo(0.4041889, 6);
  });

  it("kølemiddelblanding R-404A beregnes af komponenternes GWP", () => {
    const r = calcScope1({ hasRefrigerantLeaks: "yes", refrigerantLeaks: [{ refrigerant: "R-404A", kg: 10 }] }, lookup);
    expect(r.tCO2e).toBeCloseTo(47.28, 6);
  });

  it("procesudledning i ton og manglende faktor rapporteres", () => {
    const r = calcScope1({ hasProcessEmissions: "yes", processEmissions: [{ gas: "SF6", unit: "ton", amount: 0.001 }, { gas: "HFC-23", unit: "kg", amount: 1 }] }, lookup);
    expect(r.tCO2e).toBeCloseTo(24.3, 6);
    expect(r.issues.filter((i) => i.level === "missing")).toHaveLength(1);
  });

  it("ignorerer kilder, når spørgsmålet er besvaret Nej", () => {
    expect(calcScope1({ hasStationary: "no", stationarySources: [{ fuel: "Naturgas", unit: "m3", amount: 1 }] }, lookup).tCO2e).toBe(0);
  });
});

describe("vand og affald", () => {
  it("vandforbrug = indtag + regnvand − udledning (L omregnes)", () => {
    const w = calcWater({ buysWater: "yes", waterIntake: { value: 1000, unit: "m3" }, usesRainwater: "yes", rainwater: { value: 50000, unit: "L" }, significantConsumption: "yes", waterDischarge: { value: 800, unit: "m3" } });
    expect(w).toEqual({ intakeM3: 1050, dischargeM3: 800, consumptionM3: 250 });
  });

  it("affald i ton fordelt på farligt/ikke-farligt", () => {
    const w = calcWaste({ householdOnly: "no", wasteRows: [{ hazardous: "NON_HAZARDOUS", unit: "kg", generated: 2000, recycled: 1500 }, { hazardous: "HAZARDOUS", unit: "ton", generated: 0.5, disposed: 0.5 }] });
    expect(w).toEqual({ hazardousT: 0.5, nonHazardousT: 2, recycledT: 1.5, disposedT: 0.5 });
  });
});

describe("selskabets nøgletal", () => {
  const result = calcCompany(
    {
      modules: {
        general: { turnover: 50_000_000, employees: 42 },
        workforce: {
          unit: "HEADCOUNT",
          employees: [
            { country: "Danmark", gender: "MALE", contract: "PERMANENT", count: 25 },
            { country: "Danmark", gender: "FEMALE", contract: "PERMANENT", count: 15 },
            { country: "Sverige", gender: "FEMALE", contract: "TEMPORARY", count: 2 },
          ],
          leavers: 5,
          employeesStart: 40,
          employeesEnd: 44,
        },
        health: { recordableAccidents: 3, fatalitiesAccidents: 0, fatalitiesIllHealth: 0 },
        pay: { payGapRequired: "yes", hoursMen: 40000, hoursWomen: 40000, grossPayMen: 16_000_000, grossPayWomen: 14_400_000, coveredByAgreement: 21, trainingHoursMen: 250, trainingHoursWomen: 170 },
        scope1: { hasStationary: "yes", stationarySources: [{ fuel: "Naturgas", unit: "m3", amount: 12500, biogasShare: 25, location: "L1" }] },
      },
      locations: [{ id: "L1", name: "Lager", energy: { buysElectricity: "yes", electricity: { value: 185, unit: "MWh" }, hasGuaranteesOfOrigin: "no" }, biodiversity: { waterStress: "NO" } }],
    },
    lookup,
  );

  it("drivhusgasser og intensitet", () => {
    expect(result.ghg.scope1T).toBeCloseTo(20.63532, 4);
    expect(result.ghg.scope2LocationT).toBeCloseTo(7.47749, 4);
    expect(result.ghg.totalLocationT).toBeCloseTo(28.11281, 4);
    expect(result.ghg.intensityPerMDKK).toBeCloseTo(28.11281 / 50, 4);
    expect(result.locations[0].scope1T).toBeCloseTo(20.63532, 4);
  });

  it("energitabel (B3 pkt. 32)", () => {
    expect(result.energy.electricity.nonRenewable).toBeCloseTo(185);
    expect(result.energy.fuels.nonRenewable).toBeCloseTo(103.125);
    expect(result.energy.total.renewable + result.energy.total.nonRenewable).toBeCloseTo(322.5);
  });

  it("medarbejdere, ulykkesfrekvens, lønforskel, overenskomst og omsætning", () => {
    expect(result.workforce.total).toBe(42);
    expect(result.workforce.byGender).toEqual({ MALE: 25, FEMALE: 17 });
    expect(result.workforce.byContract).toEqual({ PERMANENT: 40, TEMPORARY: 2 });
    expect(result.health.accidentRate).toBeCloseTo(7.5); // skabelonens eksempel: 3 / 80.000 × 200.000
    expect(result.pay.payGapPct).toBeCloseTo(10);
    expect(result.pay.cbaCoveragePct).toBeCloseTo(50);
    expect(result.pay.trainingHoursPerEmployee).toBeCloseTo(10);
    expect(result.pay.trainingMen).toBeCloseTo(10);
    expect(result.pay.trainingWomen).toBeCloseTo(10);
    expect(result.c5.turnoverPct).toBeCloseTo(11.905, 3);
  });
});
