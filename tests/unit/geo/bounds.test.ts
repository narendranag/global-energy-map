import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CountryCollection } from "@/lib/geo/countries";
import {
  MIN_BOUNDS_SPAN_DEG,
  countryBoundsFrom,
  withMinimumExtent,
} from "@/lib/geo/bounds";
import type { Bounds } from "@/lib/state/camera";

const FC: CountryCollection = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/data/countries.geojson"), "utf8"),
) as CountryCollection;

const bounds = (iso3: string): Bounds => {
  const b = countryBoundsFrom(FC, iso3);
  if (b === null) throw new Error(`no bounds for ${iso3}`);
  return b;
};

const span = (b: Bounds) => b[2] - b[0];

describe("countryBoundsFrom", () => {
  it("returns null for a country with no polygon", () => {
    expect(countryBoundsFrom(FC, "SGP")).toBeNull();
    expect(countryBoundsFrom(FC, "ZZZ")).toBeNull();
  });

  it("brackets a simple country", () => {
    const [w, s, e, n] = bounds("JPN");
    expect(w).toBeGreaterThan(125);
    expect(e).toBeLessThan(150);
    expect(s).toBeGreaterThan(29);
    expect(n).toBeLessThan(47);
    expect(e).toBeGreaterThan(w);
    expect(n).toBeGreaterThan(s);
  });

  it("frames a multi-polygon country around all of it", () => {
    // Indonesia: Sumatra to Papua, no antimeridian crossing.
    const [w, , e] = bounds("IDN");
    expect(w).toBeLessThan(100);
    expect(e).toBeGreaterThan(140);
  });

  describe("antimeridian countries fall back to their largest polygon", () => {
    it.each([
      // Russia really is 153° wide once its Chukotka lobe past 180° is dropped.
      ["RUS", 170],
      ["USA", 90], // contiguous 48 only (MAINLAND_ONLY)
      ["FJI", 20],
      ["NZL", 20],
    ])("%s spans less than %i°", (iso3, maxSpan) => {
      expect(span(bounds(iso3))).toBeLessThan(maxSpan);
      expect(span(bounds(iso3))).toBeGreaterThan(0);
    });

    it("picks the mainland, not an outlying fragment", () => {
      // Russia's Chukotka lobe past 180° is dropped; Moscow stays inside.
      const [w, s, e, n] = bounds("RUS");
      expect(w).toBeLessThan(37.6);
      expect(e).toBeGreaterThan(37.6);
      expect(s).toBeLessThan(55.8);
      expect(n).toBeGreaterThan(55.8);
      // The continental US, not Alaska: Kansas is inside, Anchorage is not.
      const usa = bounds("USA");
      expect(usa[0]).toBeLessThan(-98);
      expect(usa[2]).toBeGreaterThan(-98);
      expect(usa[0]).toBeGreaterThan(-150);
    });
  });

  it("gives every country a usable box", () => {
    for (const f of FC.features) {
      const b = bounds(f.properties.iso3);
      expect(b.every(Number.isFinite)).toBe(true);
      expect(b[2]).toBeGreaterThan(b[0]);
      expect(b[3]).toBeGreaterThan(b[1]);
      expect(span(b)).toBeLessThanOrEqual(360);
      expect(b[1]).toBeGreaterThanOrEqual(-90);
      expect(b[3]).toBeLessThanOrEqual(90);
    }
  });

  it("gives a tiny state a minimum extent", () => {
    // Every country ends up at least MIN_BOUNDS_SPAN_DEG across.
    for (const f of FC.features) {
      const b = bounds(f.properties.iso3);
      expect(span(b)).toBeGreaterThanOrEqual(MIN_BOUNDS_SPAN_DEG - 1e-9);
      expect(b[3] - b[1]).toBeGreaterThanOrEqual(MIN_BOUNDS_SPAN_DEG - 1e-9);
    }
  });
});

describe("withMinimumExtent", () => {
  it("grows a pinpoint about its centre and leaves a big box alone", () => {
    expect(withMinimumExtent([10, 20, 10, 20], 2)).toEqual([9, 19, 11, 21]);
    const big: Bounds = [-10, -10, 10, 10];
    expect(withMinimumExtent(big, 2)).toEqual(big);
  });

  it("never runs past the map's limits", () => {
    expect(withMinimumExtent([-180, 84, -179.9, 85], 4)[0]).toBe(-180);
    expect(withMinimumExtent([179.9, 84, 180, 85], 4)[2]).toBe(180);
    expect(withMinimumExtent([0, 84.9, 1, 85], 4)[3]).toBeLessThanOrEqual(85.06);
  });
});
