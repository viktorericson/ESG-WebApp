import { describe, expect, it } from "vitest";
import { evaluateModule } from "../engine";
import type { FormContext } from "../types";
import { companyGovernance } from "./company-governance";
import { companyHumanRights } from "./company-human-rights";
import { companyPay } from "./company-pay";
import { ALL_POLICY_TOPICS, companyPolicies } from "./company-policies";
import { companyWorkforce } from "./company-workforce";
import { companyScope1 } from "./company-scope1";
import { locationWaste } from "./location-waste";
import { locationWater } from "./location-water";

const ctx: FormContext = { comprehensive: false, employees: 40 };

describe("politikregister (B2)", () => {
  const allNo = Object.fromEntries(ALL_POLICY_TOPICS.map((t) => [`${t.key}_practice`, "NO"]));

  it("kræver svar for alle 10 emner + cirkulær økonomi", () => {
    expect(ALL_POLICY_TOPICS).toHaveLength(10);
    expect(evaluateModule(companyPolicies, {}, ctx).required).toBe(11);
    expect(evaluateModule(companyPolicies, { ...allNo, usesCircularPrinciples: "no" }, ctx).complete).toBe(true);
  });

  it("mål kræves kun når der er praksis; C2-beskrivelse kun ved B+C", () => {
    const a = { ...allNo, climate_practice: "INTERNAL", usesCircularPrinciples: "no" };
    expect(evaluateModule(companyPolicies, a, ctx).required).toBe(12);
    expect(evaluateModule(companyPolicies, a, { ...ctx, comprehensive: true }).required).toBe(13);
  });

  it("advarer ved modstrid mellem cirkulær praksis og principper", () => {
    const ev = evaluateModule(companyPolicies, { ...allNo, usesCircularPrinciples: "yes" }, ctx);
    expect(ev.warnings).toHaveLength(1);
  });
});

describe("medarbejdere (B8)", () => {
  const row = (count: number) => ({ _id: String(count), country: "Danmark", gender: "MALE", contract: "PERMANENT", count });

  it("advarer når summen afviger fra B1", () => {
    expect(evaluateModule(companyWorkforce, { unit: "HEADCOUNT", employees: [row(30)] }, ctx).warnings).toHaveLength(1);
    expect(evaluateModule(companyWorkforce, { unit: "HEADCOUNT", employees: [row(25), row(15)] }, ctx).warnings).toHaveLength(0);
  });

  it("C5 er skjult og ikke krævet i Basismodulet", () => {
    const ev = evaluateModule(companyWorkforce, { unit: "HEADCOUNT", employees: [row(40)] }, ctx);
    expect(ev.complete).toBe(true);
    expect(ev.sections.find((s) => s.key === "supplementary")?.visible).toBe(false);
  });
});

describe("løn (B10)", () => {
  it("bruttoløn kræves kun når lønforskel skal oplyses", () => {
    const base = { minWageByAgreement: "yes", allAboveMinWage: "YES", coveredByAgreement: 40, hoursMen: 40000, hoursWomen: 37000, trainingHoursMen: 200, trainingHoursWomen: 180 };
    expect(evaluateModule(companyPay, { ...base, payGapRequired: "no" }, ctx).complete).toBe(true);
    expect(evaluateModule(companyPay, { ...base, payGapRequired: "yes" }, ctx).complete).toBe(false);
  });

  it("advarer ved urealistiske arbejdstimer", () => {
    const ev = evaluateModule(companyPay, { hoursMen: 400, hoursWomen: 0 }, ctx);
    expect(ev.warnings.some((w) => w.section === "hoursPayTraining")).toBe(true);
  });
});

describe("forretningsadfærd (B11)", () => {
  it("antal og bøder kræves kun ved domme", () => {
    expect(evaluateModule(companyGovernance, { hadConvictions: "no" }, ctx).complete).toBe(true);
    expect(evaluateModule(companyGovernance, { hadConvictions: "yes" }, ctx).complete).toBe(false);
  });
});


describe("scope 1 (B3)", () => {
  it("frivilligt for ≤10 ansatte, krævet ellers", () => {
    expect(evaluateModule(companyScope1, {}, { ...ctx, employees: 5 }).complete).toBe(true);
    expect(evaluateModule(companyScope1, {}, ctx).complete).toBe(false);
  });

  it("advarer om elbiler i liter", () => {
    const a = { hasVehicles: "yes", vehicles: [{ _id: "1", vehicleType: "Personbil (el)", unit: "L", amount: 10 }] };
    expect(evaluateModule(companyScope1, a, ctx).warnings).toHaveLength(1);
  });
});

describe("vand og affald", () => {
  it("advarer når udledning overstiger indtag (på tværs af enheder)", () => {
    const a = { buysWater: "yes", waterIntake: { value: 100, unit: "m3" }, significantConsumption: "yes", waterDischarge: { value: 150000, unit: "L" } };
    expect(evaluateModule(locationWater, a, ctx).warnings).toHaveLength(1);
  });

  it("kun husholdningsaffald kræver ingen tabel; genanvendt > genereret advarer", () => {
    expect(evaluateModule(locationWaste, { householdOnly: "yes" }, ctx).complete).toBe(true);
    const a = { householdOnly: "no", wasteRows: [{ _id: "1", type: "Pap", hazardous: "NON_HAZARDOUS", unit: "kg", generated: 100, recycled: 90, disposed: 30 }] };
    expect(evaluateModule(locationWaste, a, ctx).warnings).toHaveLength(1);
  });
});


describe("menneskerettigheder (C6, C7)", () => {
  const bc = { ...ctx, comprehensive: true };
  const noIncidents = { incChildLabour: "no", incForcedLabour: "no", incTrafficking: "no", incDiscrimination: "no", incOther: "no", hasValueChainIncidents: "no" };

  it("skjult og ikke krævet i Basismodulet", () => {
    const ev = evaluateModule(companyHumanRights, {}, ctx);
    expect(ev.sections.every((s) => !s.visible)).toBe(true);
    expect(ev.required).toBe(0);
  });

  it("politikkens emner kræves kun, når der er en politik", () => {
    expect(evaluateModule(companyHumanRights, { hasHumanRightsPolicy: "no", hasGrievanceMechanism: "yes", ...noIncidents }, bc).complete).toBe(true);
    const withPolicy = evaluateModule(companyHumanRights, { hasHumanRightsPolicy: "yes", hasGrievanceMechanism: "yes", ...noIncidents }, bc);
    expect(withPolicy.complete).toBe(false);
    expect(withPolicy.required).toBe(2 + 6 + 6); // politik + klage, 6 emner, 6 hændelsesspørgsmål
  });

  it("frivilligt for 10 ansatte eller derunder", () => {
    expect(evaluateModule(companyHumanRights, {}, { ...bc, employees: 8 }).complete).toBe(true);
  });

  it("hændelser i værdikæden kræver beskrivelse, og hændelser uden tiltag giver en advarsel", () => {
    const a = { hasHumanRightsPolicy: "no", hasGrievanceMechanism: "no", ...noIncidents, incDiscrimination: "yes", hasValueChainIncidents: "yes" };
    const ev = evaluateModule(companyHumanRights, a, bc);
    expect(ev.complete).toBe(false);
    expect(ev.warnings).toHaveLength(1);
    const done = evaluateModule(companyHumanRights, { ...a, valueChainIncidents: [{ _id: "1", group: "COMMUNITIES", description: "Støj" }], incidentActions: "Dialog og ny politik" }, bc);
    expect(done.complete).toBe(true);
    expect(done.warnings).toHaveLength(0);
  });
});
