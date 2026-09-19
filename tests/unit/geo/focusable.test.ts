import { describe, it, expect } from "vitest";
import { EXTRA_COUNTRY_NAMES } from "@/lib/geo/countries";
import { COUNTRY_ANCHORS } from "@/lib/geo/country-anchors";
import { isFocusableCountry, isKnownCountry, parseIso3 } from "@/lib/geo/iso3";

/**
 * B1. The country panel's partner rows can name codes with no 1:110m polygon
 * (SGP, HKG, CUW, MUS, BRB…). Clicking one used to open the panel with no
 * outline, a "Zoom to" that did nothing, and a `?focus=SGP` that `parseIso3`
 * threw away on reload — the shared link silently lost its selection.
 *
 * A focus is now valid for any code with a country **anchor**: the outline
 * falls back to a ring at the anchor and the fit to a flyTo. Singapore (the
 * refining hub) and Bahrain (a Gulf exporter) are exactly the countries this
 * domain cannot afford to drop.
 */
describe("isFocusableCountry (B1)", () => {
  it("accepts every country we hold a polygon for", () => {
    for (const code of ["JPN", "USA", "SDS", "QAT"]) {
      expect(isFocusableCountry(code), code).toBe(true);
    }
  });

  it("accepts the polygon-less countries that matter in this domain", () => {
    for (const code of ["SGP", "BHR", "HKG", "MLT", "CUW", "MUS", "BRB"]) {
      expect(isFocusableCountry(code), code).toBe(true);
      expect(isKnownCountry(code), `${code} has no polygon`).toBe(false);
    }
  });

  it("rejects BACI pseudo-codes and nonsense", () => {
    for (const code of ["S19", "ZA1", "PUS", "XXX", ""]) {
      expect(isFocusableCountry(code), code).toBe(false);
    }
  });

  it("is exactly the anchor set", () => {
    for (const code of Object.keys(COUNTRY_ANCHORS)) {
      expect(isFocusableCountry(code), code).toBe(true);
    }
    for (const code of Object.keys(EXTRA_COUNTRY_NAMES)) {
      expect(isFocusableCountry(code), code).toBe(true);
    }
  });
});

describe("parseIso3 accepts anchored codes (B1)", () => {
  it("keeps a polygon-less partner selection", () => {
    expect(parseIso3("SGP")).toBe("SGP");
    expect(parseIso3("bhr")).toBe("BHR");
    expect(parseIso3(" hkg ")).toBe("HKG");
  });

  it("still rejects what it always rejected", () => {
    expect(parseIso3("S19")).toBeNull();
    expect(parseIso3("JAPAN")).toBeNull();
    expect(parseIso3(null)).toBeNull();
  });
});
