import { describe, expect, it } from "vitest";
import { esriRings } from "./geo-facts";
import { mapParcel, parcelBounds, wgs84ToUtm32 } from "./parcels";

const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const row = (bfenummer: number, visningstekst: string, coordinates: unknown) => ({ bfenummer, visningstekst, geometri: { type: "MultiPolygon", coordinates } });

describe("grundgrænser", () => {
  it("WGS84 omregnes til UTM zone 32", () => {
    // Midtermeridianen (9° Ø) ligger på x = 500.000; kontrolpunkt i Støvring sammenholdt med Matriklens koordinater
    expect(wgs84ToUtm32(56, 9)[0]).toBeCloseTo(500000, 6);
    const [x, y] = wgs84ToUtm32(56.880154, 9.838605);
    expect(x).toBeCloseTo(551106.38, 1);
    expect(y).toBeCloseTo(6304358.6, 1);
  });

  it("samler alle jordstykker med præcis det BFE-nummer", () => {
    const parcel = mapParcel([row(2379317, "98ar, Birkerød By", [[ring]]), row(23793170, "anden ejendom", [[ring]]), row(2379317, "98as, Birkerød By", [[ring], [ring]])], "2379317");
    expect(parcel?.labels).toEqual(["98ar, Birkerød By", "98as, Birkerød By"]);
    expect(parcel?.polygons).toHaveLength(3);
    expect(parcelBounds(parcel!)).toEqual([0, 0, 10, 10]);
  });

  it("giver null uden træf eller ved ugyldigt svar", () => {
    expect(mapParcel([row(1, "x", [[ring]])], "2")).toBeNull();
    expect(mapParcel([row(1, "x", [[[[0, 0]]]])], "1")).toBeNull();
    expect(mapParcel({ status: "BAD_REQUEST" }, "1")).toBeNull();
  });

  it("vender ringe, så ydre ringe går med uret og huller mod uret", () => {
    const ccw = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as [number, number][];
    const cw = [...ccw].reverse();
    const area = (r: number[][]) => r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0);
    const [outer, hole] = esriRings({ bfeNumber: "1", labels: [], polygons: [[ccw, ccw]] });
    expect(area(outer)).toBeLessThan(0);
    expect(area(hole)).toBeGreaterThan(0);
    expect(area(esriRings({ bfeNumber: "1", labels: [], polygons: [[cw]] })[0])).toBeLessThan(0);
  });
});
