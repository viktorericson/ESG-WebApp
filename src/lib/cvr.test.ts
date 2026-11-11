import { describe, expect, it } from "vitest";
import { addressKey, mapCvrApiUnits, mapCvrApiResponse, naceFromIndustryCode } from "./cvr";

describe("CVR-opslag", () => {
  it("branchekode bliver til NACE-kode, også med foranstillet nul", () => {
    expect(naceFromIndustryCode(212000)).toBe("21.20");
    expect(naceFromIndustryCode(11100)).toBe("01.11");
    expect(naceFromIndustryCode("620100")).toBe("62.01");
    expect(naceFromIndustryCode(null)).toBeNull();
    expect(naceFromIndustryCode(99)).toBeNull();
  });

  it("oversætter et svar til stamdata", () => {
    const r = mapCvrApiResponse({
      vat: 24256790,
      name: "NOVO NORDISK A/S",
      address: "Novo Alle 1",
      zipcode: "2880",
      city: "Bagsværd",
      industrycode: 212000,
      companycode: 60,
      enddate: null,
    });
    expect(r).toEqual({
      ok: true,
      company: { cvr: "24256790", name: "NOVO NORDISK A/S", address: "Novo Alle 1, 2880 Bagsværd", legalForm: "AS", naceCodes: ["21.20"], ended: false },
    });
  });

  it("ukendt virksomhedsform bliver ANDET, og ophørte selskaber markeres", () => {
    const r = mapCvrApiResponse({ vat: 1, name: "Fonden X", companycode: 110, enddate: "01/02 - 2020" });
    expect(r.ok && r.company).toMatchObject({ legalForm: "ANDET", address: null, naceCodes: [], ended: true });
  });

  it("fejl fra tjenesten giver en dansk besked", () => {
    expect(mapCvrApiResponse({ error: "NOT_FOUND" })).toMatchObject({ ok: false, error: expect.stringContaining("ikke fundet") });
    expect(mapCvrApiResponse({ error: "QUOTA_EXCEEDED" })).toMatchObject({ ok: false, error: expect.stringContaining("kvote") });
    expect(mapCvrApiResponse("<html>")).toMatchObject({ ok: false });
  });

  it("P-enheder: kun aktive med adresse, hovedenheden først", () => {
    const r = mapCvrApiUnits({
      vat: 1,
      name: "Firma A/S",
      productionunits: [
        { pno: 3, main: false, name: "Firma A/S - Lager", address: "Bvej 2", zipcode: "8000", city: "Aarhus C", industrydesc: "Lagerdrift", enddate: null },
        { pno: 2, main: false, name: "Lukket", address: "Cvej 3", zipcode: "5000", city: "Odense", enddate: "01/02 - 2020" },
        { pno: 1, main: true, name: "", address: "Avej 1", zipcode: "2100", city: "København Ø", industrydesc: null, enddate: null },
        { pno: 4, main: false, name: "Uden adresse", address: null, enddate: null },
      ],
    });
    expect(r).toEqual({
      ok: true,
      units: [
        { pno: "1", name: "Firma A/S", address: "Avej 1, 2100 København Ø", function: null, main: true },
        { pno: "3", name: "Firma A/S - Lager", address: "Bvej 2, 8000 Aarhus C", function: "Lagerdrift", main: false },
      ],
    });
    expect(mapCvrApiUnits({ vat: 1, name: "X" })).toEqual({ ok: true, units: [] });
    expect(mapCvrApiUnits({ error: "NOT_FOUND" })).toMatchObject({ ok: false });
  });

  it("adresser sammenlignes uden tegnsætning og store bogstaver", () => {
    expect(addressKey("Novo Allé 1, 2880  Bagsværd")).toBe(addressKey("novo allé 1 2880 bagsværd"));
    expect(addressKey("Avej 1")).not.toBe(addressKey("Avej 11"));
  });
});
