import { describe, expect, it } from "vitest";
import { MAP_BUFFER_M, MAP_HEIGHT, MAP_WIDTH, MIN_GROUND_WIDTH_M, mapView, scaleBarMeters } from "./area-maps";
import type { Parcel } from "./parcels";

const square = (x: number, y: number, size: number): Parcel => ({ bfeNumber: "1", labels: [], polygons: [[[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]]] });

describe("kortudsnit", () => {
  it("uden grund: mindste udsnit centreret på punktet, i billedets formforhold", () => {
    const { bbox, groundWidth } = mapView([551106, 6304358]);
    expect(groundWidth).toBe(MIN_GROUND_WIDTH_M);
    expect((bbox[0] + bbox[2]) / 2).toBeCloseTo(551106, 6);
    expect((bbox[3] - bbox[1]) / (bbox[2] - bbox[0])).toBeCloseTo(MAP_HEIGHT / MAP_WIDTH, 9);
  });

  it("med grund: centreres på grunden, og store grunde får plads til bufferen", () => {
    const small = mapView([0, 0], square(700000, 6190000, 60));
    expect(small.groundWidth).toBe(MIN_GROUND_WIDTH_M);
    expect((small.bbox[0] + small.bbox[2]) / 2).toBeCloseTo(700030, 6);

    const big = mapView([0, 0], square(700000, 6190000, 2000));
    const height = (big.groundWidth * MAP_HEIGHT) / MAP_WIDTH;
    expect(height).toBeGreaterThan(2000 + 2 * MAP_BUFFER_M);
    expect(big.groundWidth % 100).toBe(0);
  });

  it("målestokken passer til udsnittet", () => {
    expect(scaleBarMeters(1200)).toBe(200);
    expect(scaleBarMeters(6000)).toBe(1000);
    expect(scaleBarMeters(100)).toBe(50);
  });
});
