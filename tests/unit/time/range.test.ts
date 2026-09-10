import { describe, it, expect } from "vitest";
import {
  YEAR_MIN,
  YEAR_MAX,
  RESERVES_LATEST_YEAR,
  clampYear,
  reservesDataYear,
} from "@/lib/time/range";

describe("year range constants", () => {
  it("spans 1990–2024 with reserves frozen at 2020", () => {
    expect(YEAR_MIN).toBe(1990);
    expect(YEAR_MAX).toBe(2024);
    expect(RESERVES_LATEST_YEAR).toBe(2020);
  });
});

describe("clampYear", () => {
  it("passes through in-range years", () => {
    expect(clampYear(1990)).toBe(1990);
    expect(clampYear(2007)).toBe(2007);
    expect(clampYear(2024)).toBe(2024);
  });

  it("clamps years above the range to YEAR_MAX", () => {
    expect(clampYear(2025)).toBe(2024);
    expect(clampYear(99999)).toBe(2024);
  });

  it("clamps years below the range to YEAR_MIN", () => {
    expect(clampYear(1989)).toBe(1990);
    expect(clampYear(1800)).toBe(1990);
    expect(clampYear(-5)).toBe(1990);
  });

  it("rounds non-integers before clamping", () => {
    expect(clampYear(2010.6)).toBe(2011);
  });
});

describe("reservesDataYear", () => {
  it("returns the selected year up to the reserves cut-off", () => {
    expect(reservesDataYear(1995)).toBe(1995);
    expect(reservesDataYear(2020)).toBe(2020);
  });

  it("freezes at RESERVES_LATEST_YEAR after the cut-off", () => {
    expect(reservesDataYear(2021)).toBe(2020);
    expect(reservesDataYear(2024)).toBe(2020);
  });
});
