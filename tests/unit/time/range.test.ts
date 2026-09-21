import { describe, it, expect } from "vitest";
import {
  YEAR_MIN,
  YEAR_MAX,
  RESERVES_LATEST_YEAR,
  clampYear,
  reservesDataYear,
} from "@/lib/time/range";
import * as years from "@/lib/data-catalog/years";

describe("year range constants", () => {
  it("re-exports the catalog-derived axis (no literals live here)", () => {
    expect(YEAR_MIN).toBe(years.YEAR_MIN);
    expect(YEAR_MAX).toBe(years.YEAR_MAX);
    expect(RESERVES_LATEST_YEAR).toBe(years.RESERVES_LATEST_YEAR);
  });

  it("freezes reserves inside the axis", () => {
    expect(RESERVES_LATEST_YEAR).toBeGreaterThanOrEqual(YEAR_MIN);
    expect(RESERVES_LATEST_YEAR).toBeLessThanOrEqual(YEAR_MAX);
  });
});

describe("clampYear", () => {
  it("passes through in-range years", () => {
    expect(clampYear(YEAR_MIN)).toBe(YEAR_MIN);
    expect(clampYear(2007)).toBe(2007);
    expect(clampYear(YEAR_MAX)).toBe(YEAR_MAX);
  });

  it("clamps years above the range to YEAR_MAX", () => {
    expect(clampYear(YEAR_MAX + 1)).toBe(YEAR_MAX);
    expect(clampYear(99999)).toBe(YEAR_MAX);
  });

  it("clamps years below the range to YEAR_MIN", () => {
    expect(clampYear(YEAR_MIN - 1)).toBe(YEAR_MIN);
    expect(clampYear(1800)).toBe(YEAR_MIN);
    expect(clampYear(-5)).toBe(YEAR_MIN);
  });

  it("rounds non-integers before clamping", () => {
    expect(clampYear(2010.6)).toBe(2011);
  });
});

describe("reservesDataYear", () => {
  it("returns the selected year up to the reserves cut-off", () => {
    expect(reservesDataYear(RESERVES_LATEST_YEAR - 1)).toBe(RESERVES_LATEST_YEAR - 1);
    expect(reservesDataYear(RESERVES_LATEST_YEAR)).toBe(RESERVES_LATEST_YEAR);
  });

  it("freezes at RESERVES_LATEST_YEAR after the cut-off", () => {
    expect(reservesDataYear(RESERVES_LATEST_YEAR + 1)).toBe(RESERVES_LATEST_YEAR);
    expect(reservesDataYear(YEAR_MAX)).toBe(RESERVES_LATEST_YEAR);
  });
});
