import { describe, expect, it } from "vitest";
import { companySchema, cvrSchema, locationSchema, periodSchema } from "./validation";

describe("validering", () => {
  it("CVR accepterer mellemrum og kræver 8 cifre", () => {
    expect(cvrSchema.parse("1234 5678")).toBe("12345678");
    expect(cvrSchema.safeParse("1234567").success).toBe(false);
  });

  it("selskab: NACE-koder splittes og tomme felter bliver null", () => {
    const c = companySchema.parse({ name: "A/S", cvr: "12345678", address: "", naceCodes: "62.01, 70.22", legalForm: "", parentId: "", consolidate: "on" });
    expect(c.naceCodes).toEqual(["62.01", "70.22"]);
    expect(c.address).toBeNull();
    expect(c.legalForm).toBeNull();
    expect(c.consolidate).toBe(true);
  });

  it("periode: slutdato skal være efter start", () => {
    expect(periodSchema.safeParse({ year: 2025, startDate: "2025-12-31", endDate: "2025-01-01" }).success).toBe(false);
  });
});

describe("lokation", () => {
  const base = { name: "Lager", address: "Vej 1", function: "", control: "EJER" };

  it("accepterer dansk decimalkomma og tomme koordinater", () => {
    expect(locationSchema.parse({ ...base, latitude: "55,7", longitude: "12,5" })).toMatchObject({ latitude: 55.7, longitude: 12.5 });
    expect(locationSchema.parse({ ...base, latitude: "", longitude: "" })).toMatchObject({ latitude: null, longitude: null });
  });

  it("kræver begge koordinater og gyldig driftsperiode", () => {
    expect(locationSchema.safeParse({ ...base, latitude: "55", longitude: "" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...base, latitude: "95", longitude: "10" }).success).toBe(false);
    expect(locationSchema.safeParse({ ...base, operationalFrom: "2024-01-01", operationalTo: "2023-01-01" }).success).toBe(false);
  });
});
