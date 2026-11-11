import { describe, expect, it } from "vitest";
import { calcCompany } from "./company";
import { consolidate } from "./consolidate";
import { calcScope3 } from "./scope3";
import type { FactorLookup } from "./types";
import { highImpactSector, isHighImpactNace } from "../nace";

const factors: Record<string, { scope1: number; scope2: number; scope3: number; outsideScopes: number; unit: string }> = {
  steel: { scope1: 0, scope2: 0, scope3: 2.5, outsideScopes: 0, unit: "kg" },
  spend: { scope1: 0, scope2: 0, scope3: 0.05, outsideScopes: 0, unit: "DKK" },
};
const lookup: FactorLookup = (k) => factors[k];

describe("scope 3", () => {
  it("er tom, når selskabet ikke opgør scope 3", () => {
    const r = calcScope3({ includeScope3: "no" }, lookup, 10);
    expect(r.included).toBe(false);
    expect(r.totalT).toBe(0);
  });

  it("beregner faktorlinjer, leverandørtal og kategori 3 automatisk", () => {
    const r = calcScope3(
      {
        includeScope3: "yes",
        cat1: "RELEVANT",
        cat3: "RELEVANT",
        cat6: "RELEVANT",
        cat11: "NOT_RELEVANT",
        autoCategory3: "yes",
        activities: [
          { category: "1", description: "Stål", factor: "steel", amount: 4000 },
          { category: "1", description: "Rådgivning", factor: "spend", amount: 200_000 },
          { category: "6", description: "Flyrejser", supplierT: 3.2, factor: "steel", amount: 1 },
        ],
      },
      lookup,
      1.5,
    );
    expect(r.byCategory[1]).toBeCloseTo(10 + 10);
    expect(r.byCategory[3]).toBeCloseTo(1.5);
    // Leverandørens tal går forud for faktor × mængde
    expect(r.byCategory[6]).toBeCloseTo(3.2);
    expect(r.totalT).toBeCloseTo(24.7);
    expect(r.notRelevant).toEqual([11]);
    expect(r.issues).toEqual([]);
  });

  it("advarer om relevante kategorier uden data og ufuldstændige aktiviteter", () => {
    const r = calcScope3({ includeScope3: "yes", cat4: "RELEVANT", activities: [{ category: "1", description: "Uden mængde", factor: "steel" }] }, lookup, 0);
    expect(r.issues.map((i) => i.message).join(" ")).toMatch(/Uden mængde.*/);
    expect(r.issues.map((i) => i.message).join(" ")).toMatch(/kategorier 4/);
  });

  it("indgår i selskabets og koncernens resultat", () => {
    const withS3 = calcCompany({ modules: { scope3: { includeScope3: "yes", activities: [{ category: "1", description: "Stål", factor: "steel", amount: 1000 }] } }, locations: [] }, lookup);
    const without = calcCompany({ modules: {}, locations: [] }, lookup);
    expect(withS3.ghg.scope3T).toBeCloseTo(2.5);
    expect(without.ghg.scope3T).toBeNull();
    const g = consolidate(
      [
        { companyId: "a", name: "A", result: withS3 },
        { companyId: "b", name: "B", result: without },
      ],
      { reportingCompanyId: "a" },
    );
    expect(g.ghg.scope3T).toBeCloseTo(2.5);
    expect(g.scope3.lines[0].label).toBe("A: Stål");
  });
});

describe("sektorer med stor klimaindvirkning", () => {
  it("følger NACE A–H og fast ejendom", () => {
    expect(isHighImpactNace("25.62")).toBe(true);
    expect(isHighImpactNace("49.41")).toBe(true);
    expect(isHighImpactNace("68.20")).toBe(true);
    expect(isHighImpactNace("62.20")).toBe(false);
    expect(highImpactSector([])).toBeNull();
    expect(highImpactSector(["62.20", "46.90"])).toBe(true);
  });
});
