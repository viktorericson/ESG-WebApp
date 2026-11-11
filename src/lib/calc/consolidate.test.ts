import { describe, expect, it } from "vitest";
import { calcCompany, type CompanyInput } from "./company";
import { consolidate } from "./consolidate";
import { electricityKey } from "./factor-keys";
import type { FactorLookup } from "./types";

const lookup: FactorLookup = (k) => (k === electricityKey("Miljødeklaration") ? { scope1: 0, scope2: 40, scope3: 0, outsideScopes: 0, unit: "MWh" } : undefined);

const company = (o: { accidents: number; hoursM: number; hoursF: number; payM?: number; payF?: number; employees: number; turnover: number; mwh: number; covered: number; board?: [number, number] }): CompanyInput => ({
  modules: {
    general: { turnover: o.turnover, employees: o.employees },
    workforce: { unit: "HEADCOUNT", employees: [{ country: "Danmark", gender: "MALE", contract: "PERMANENT", count: o.employees }] },
    health: { recordableAccidents: o.accidents },
    pay: {
      payGapRequired: o.payM !== undefined ? "yes" : "no",
      hoursMen: o.hoursM,
      hoursWomen: o.hoursF,
      grossPayMen: o.payM,
      grossPayWomen: o.payF,
      coveredByAgreement: o.covered,
      trainingHoursMen: 100,
      trainingHoursWomen: 0,
    },
    governance: o.board ? { hasBoard: "yes", boardWomen: o.board[0], boardMen: o.board[1] } : { hasBoard: "no" },
  },
  locations: [{ id: "L", name: "Kontor", energy: { buysElectricity: "yes", electricity: { value: o.mwh, unit: "MWh" } } }],
});

const parent = calcCompany(company({ accidents: 1, hoursM: 60000, hoursF: 40000, payM: 24_000_000, payF: 14_400_000, employees: 50, turnover: 100_000_000, mwh: 100, covered: 50, board: [2, 3] }), lookup);
const sub = calcCompany(company({ accidents: 3, hoursM: 20000, hoursF: 0, employees: 10, turnover: 20_000_000, mwh: 50, covered: 0, board: [0, 1] }), lookup);
const parts = [
  { companyId: "P", name: "Moder", result: parent },
  { companyId: "S", name: "Datter", result: sub },
];

describe("konsolidering", () => {
  const g = consolidate(parts, { reportingCompanyId: "P" });

  it("summerer absolutte tal", () => {
    expect(g.ghg.scope2LocationT).toBeCloseTo(6); // 150 MWh × 40 kg
    expect(g.energy.total.nonRenewable).toBeCloseTo(150);
    expect(g.workforce.total).toBe(60);
    expect(g.health.accidents).toBe(4);
  });

  it("genberegner rater af summerne – ikke gennemsnit af rater", () => {
    // Moder: 2,0 og datter: 30,0 – gennemsnit ville være 16
    expect(parent.health.accidentRate).toBeCloseTo(2);
    expect(sub.health.accidentRate).toBeCloseTo(30);
    expect(g.health.accidentRate).toBeCloseTo((4 / 120000) * 200000);
    expect(g.pay.cbaCoveragePct).toBeCloseTo((50 / 60) * 100);
    expect(g.pay.trainingHoursPerEmployee).toBeCloseTo(200 / 60);
  });

  it("lønforskel kun fra selskaber, der har oplyst lønsummer", () => {
    // Moder: 400 kr/t mænd, 360 kr/t kvinder → 10 %. Datter har ikke oplyst løn.
    expect(g.pay.payGapPct).toBeCloseTo(10);
  });

  it("intensitet bruger koncernens konsoliderede omsætning, når den er angivet", () => {
    expect(g.ghg.intensityPerMDKK).toBeCloseTo(6 / 120);
    expect(g.issues.some((i) => i.message.includes("konsoliderede omsætning"))).toBe(true);
    const withTurnover = consolidate(parts, { reportingCompanyId: "P", consolidatedTurnover: 110_000_000 });
    expect(withTurnover.ghg.intensityPerMDKK).toBeCloseTo(6 / 110);
    expect(withTurnover.issues.some((i) => i.message.includes("konsoliderede omsætning"))).toBe(false);
  });

  it("bestyrelsens kønsfordeling er det rapporterende selskabs", () => {
    expect(g.governance.boardRatio).toBeCloseTo(2 / 3);
  });

  it("advarer, hvis selskaberne opgør ansatte forskelligt", () => {
    const fte = { ...sub, workforce: { ...sub.workforce, unit: "FTE" } };
    const mixed = consolidate([parts[0], { companyId: "S", name: "Datter", result: fte }], { reportingCompanyId: "P" });
    expect(mixed.issues.some((i) => i.message.includes("headcount og FTE"))).toBe(true);
    expect(mixed.workforce.unit).toBeNull();
  });
});
