import { describe, expect, it } from "vitest";
import { EXTRA_COUNTRY_NAMES } from "@/lib/geo/countries";
import { NATURAL_EARTH_ISO3 } from "@/lib/geo/iso3";
import { COUNTRY_ANCHORS, countryAnchor } from "@/lib/geo/country-anchors";

describe("COUNTRY_ANCHORS", () => {
  it("covers every Natural Earth country and every BACI-only territory", () => {
    for (const code of NATURAL_EARTH_ISO3) {
      expect(countryAnchor(code), `missing anchor for NE country ${code}`).toBeDefined();
    }
    for (const code of Object.keys(EXTRA_COUNTRY_NAMES)) {
      expect(countryAnchor(code), `missing anchor for territory ${code}`).toBeDefined();
    }
  });

  // Called out explicitly in the S2 plan: BACI codes with no 1:110m polygon
  // that are still material energy-trade partners.
  it("covers Singapore, Bahrain, Malta and Hong Kong specifically", () => {
    for (const code of ["SGP", "BHR", "MLT", "HKG"]) {
      expect(countryAnchor(code)).toBeDefined();
    }
  });

  it("every anchor is a finite [lon, lat] within valid bounds", () => {
    for (const [code, [lon, lat]] of Object.entries(COUNTRY_ANCHORS)) {
      expect(Number.isFinite(lon), `${code} lon`).toBe(true);
      expect(Number.isFinite(lat), `${code} lat`).toBe(true);
      expect(lon, `${code} lon range`).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
      expect(lat, `${code} lat range`).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  });

  it("has no duplicate keys and no keys outside the two known-country lists", () => {
    const known = new Set([...NATURAL_EARTH_ISO3, ...Object.keys(EXTRA_COUNTRY_NAMES)]);
    for (const code of Object.keys(COUNTRY_ANCHORS)) {
      expect(known.has(code), `unexpected anchor key ${code}`).toBe(true);
    }
  });

  it("returns undefined for a code we hold no anchor for", () => {
    expect(countryAnchor("ZZZ")).toBeUndefined();
  });

  // The hand-overridden anchors should not equal a plain polygon centroid
  // guess in the middle of nowhere for energy trade (spot checks, not exact
  // values, so the test does not pin coordinates that may be refined later).
  it("moves the USA and Russia anchors off their raw geographic centre", () => {
    const [usaLon] = countryAnchor("USA") ?? [0, 0];
    const [rusLon] = countryAnchor("RUS") ?? [0, 0];
    // USA's raw centroid is near the Great Plains (~ -99°); the Gulf Coast
    // override should sit further south/east of that, still in the US.
    expect(usaLon).toBeGreaterThan(-99);
    expect(usaLon).toBeLessThan(-90);
    // Russia's raw centroid is deep in Siberia (~ 88° E); western Russia
    // should sit well west of that.
    expect(rusLon).toBeLessThan(60);
  });
});
