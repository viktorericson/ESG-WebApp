import { describe, expect, it } from "vitest";
import { mapNaturaSites, mapWaterStress, naturaFinding } from "./geo-facts";

const site = (code: string, name: string) => ({ attributes: { SITECODE: code, SITENAME: name } });

describe("Natura 2000", () => {
  it("uddrager unikke områder sorteret efter navn", () => {
    expect(mapNaturaSites({ features: [site("DK2", "Rold Skov"), site("DK1", "Lindenborg Ådal"), site("DK2", "Rold Skov")] })).toEqual([
      { code: "DK1", name: "Lindenborg Ådal" },
      { code: "DK2", name: "Rold Skov" },
    ]);
    expect(mapNaturaSites({ features: [] })).toEqual([]);
    expect(mapNaturaSites({ error: { code: 400 } })).toBeNull();
    expect(mapNaturaSites(null)).toBeNull();
  });

  it("i området går forud for nær området", () => {
    const a = [{ code: "A", name: "A" }];
    const b = [{ code: "A", name: "A" }, { code: "B", name: "B" }];
    expect(naturaFinding(a, b)).toEqual({ relation: "IN", sites: a });
    expect(naturaFinding([], b)).toEqual({ relation: "NEAR", sites: b });
    expect(naturaFinding([], [])).toEqual({ relation: "NONE", sites: [] });
  });
});

describe("vandstress", () => {
  const row = (bws_cat: number, bws_label: string) => ({ rows: [{ bws_cat, bws_label, name_0: "Denmark", name_1: "Nordjylland" }] });

  it("kun høj og ekstremt høj giver ja", () => {
    expect(mapWaterStress(row(0, "Low (<10%)"))).toEqual({ ok: true, value: { suggestion: "NO", label: "Low (<10%)", region: "Nordjylland, Denmark" } });
    expect(mapWaterStress(row(2, "Medium - High (20-40%)"))).toMatchObject({ value: { suggestion: "NO" } });
    expect(mapWaterStress(row(3, "High (40-80%)"))).toMatchObject({ value: { suggestion: "YES" } });
    expect(mapWaterStress(row(4, "Extremely High (>80%)"))).toMatchObject({ value: { suggestion: "YES" } });
  });

  it("tørre områder og manglende data giver intet forslag", () => {
    expect(mapWaterStress(row(-1, "Arid and Low Water Use"))).toMatchObject({ value: { suggestion: null } });
    expect(mapWaterStress(row(-9999, "No Data"))).toMatchObject({ value: { suggestion: null } });
    expect(mapWaterStress({ rows: [] })).toMatchObject({ ok: false, error: expect.stringContaining("ingen data") });
    expect(mapWaterStress(null)).toMatchObject({ ok: false, error: expect.stringContaining("ikke tilgængeligt") });
  });
});
