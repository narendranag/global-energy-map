import { describe, it, expect } from "vitest";
import { RESERVES_NO_DATA_COLOR, reservesColor, reservesRampT } from "@/lib/symbology";
import { formatReserves } from "@/components/layers/ReservesChoropleth";

describe("reservesRampT", () => {
  it("maps the maximum to 1 and zero / negatives to 0", () => {
    expect(reservesRampT(303, 303)).toBeCloseTo(1);
    expect(reservesRampT(0, 303)).toBe(0);
    expect(reservesRampT(-1, 303)).toBe(0);
  });

  it("is monotonic", () => {
    const vs = [0.1, 1, 5, 20, 68, 150, 303];
    const ts = vs.map((v) => reservesRampT(v, 303));
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThan(ts[i - 1] ?? Infinity);
    }
  });

  it("lifts mid-sized holders well off the floor (log, not linear)", () => {
    // USA ~68 bn bbl vs VEN ~303: linear would give 0.22.
    expect(reservesRampT(68, 303)).toBeGreaterThan(0.6);
    // UK ~2.5 bn bbl: linear ~0.008; log keeps it visible.
    expect(reservesRampT(2.5, 303)).toBeGreaterThan(0.2);
  });

  it("is scale-free (gas tcm behaves like oil bn bbl)", () => {
    expect(reservesRampT(3.7, 37)).toBeCloseTo(reservesRampT(30.3, 303));
  });
});

describe("reservesColor", () => {
  it("paints missing data grey, distinct from a zero value", () => {
    expect(reservesColor(undefined, 100)).toEqual(RESERVES_NO_DATA_COLOR);
    expect(reservesColor(null, 100)).toEqual(RESERVES_NO_DATA_COLOR);
    expect(reservesColor(0, 100)).not.toEqual(RESERVES_NO_DATA_COLOR);
  });
});

describe("formatReserves", () => {
  it("formats oil in bn bbl and gas in tcm", () => {
    expect(formatReserves(297.527, "oil")).toBe("297.5 bn bbl");
    expect(formatReserves(6.0191, "gas")).toBe("6.02 tcm");
    expect(formatReserves(0.0058, "gas")).toBe("0.006 tcm");
  });
});
