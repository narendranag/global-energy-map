import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CountryCollection } from "@/lib/geo/countries";
import { EXTRA_COUNTRY_NAMES } from "@/lib/geo/countries";
import { NATURAL_EARTH_ISO3, isKnownCountry, parseIso3 } from "@/lib/geo/iso3";

function shippedCodes(): string[] {
  const text = readFileSync(path.join(process.cwd(), "public/data/countries.geojson"), "utf8");
  const fc = JSON.parse(text) as CountryCollection;
  return fc.features.map((f) => f.properties.iso3).sort();
}

describe("NATURAL_EARTH_ISO3", () => {
  it("matches the shipped countries.geojson exactly", () => {
    expect([...NATURAL_EARTH_ISO3].sort()).toEqual(shippedCodes());
  });

  it("holds only three upper-case letters, with no duplicates", () => {
    for (const code of NATURAL_EARTH_ISO3) expect(code).toMatch(/^[A-Z]{3}$/);
    expect(new Set(NATURAL_EARTH_ISO3).size).toBe(NATURAL_EARTH_ISO3.length);
  });

  it("excludes trade-only codes that have no polygon (Singapore, Bahrain)", () => {
    for (const code of ["SGP", "BHR", "MLT"]) {
      expect(code in EXTRA_COUNTRY_NAMES).toBe(true);
      expect(isKnownCountry(code)).toBe(false);
    }
  });
});

describe("parseIso3", () => {
  it("accepts a known code, upper-casing and trimming it", () => {
    expect(parseIso3("JPN")).toBe("JPN");
    expect(parseIso3(" jpn ")).toBe("JPN");
  });

  it("rejects unknown, malformed, empty and missing codes", () => {
    for (const raw of ["ZZZ", "JP", "JPNX", "J2N", "", "   ", null, undefined]) {
      expect(parseIso3(raw)).toBeNull();
    }
  });
});
