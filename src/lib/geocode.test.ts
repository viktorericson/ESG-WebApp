import { describe, expect, it } from "vitest";
import { mapNominatimResponse } from "./geocode";

describe("geokodning", () => {
  it("oversætter et præcist adressetræf", () => {
    const r = mapNominatimResponse([
      { lat: "55.75455501", lon: "12.4551850", display_name: "1, Novo Alle, Bagsværd, 2880, Danmark", address: { house_number: "1", road: "Novo Alle" } },
    ]);
    expect(r).toEqual({ ok: true, hit: { latitude: 55.754555, longitude: 12.455185, matched: "1, Novo Alle, Bagsværd, 2880, Danmark", precise: true } });
  });

  it("træf uden husnummer markeres som omtrentligt", () => {
    const r = mapNominatimResponse([{ lat: "55.7", lon: "12.4", display_name: "Novo Alle, Bagsværd", address: { road: "Novo Alle" } }]);
    expect(r.ok && r.hit.precise).toBe(false);
  });

  it("intet træf og ugyldige svar giver en fejlbesked", () => {
    expect(mapNominatimResponse([])).toMatchObject({ ok: false, error: expect.stringContaining("ikke fundet") });
    expect(mapNominatimResponse({ error: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("ikke tilgængeligt") });
    expect(mapNominatimResponse([{ lat: "abc", lon: "1" }])).toMatchObject({ ok: false });
  });
});
