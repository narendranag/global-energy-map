import { describe, it, expect } from "vitest";
import { isVisibleAtYear, isVisibleAsOf } from "@/lib/vintage/filter";

describe("isVisibleAtYear", () => {
  it("returns true when vintage is null (always visible)", () => {
    expect(isVisibleAtYear(null, 1990)).toBe(true);
    expect(isVisibleAtYear(null, 2020)).toBe(true);
  });

  it("returns true when vintage is undefined", () => {
    expect(isVisibleAtYear(undefined, 1990)).toBe(true);
  });

  it("returns true when vintage equals year", () => {
    expect(isVisibleAtYear(1990, 1990)).toBe(true);
  });

  it("returns true when vintage is before year", () => {
    expect(isVisibleAtYear(1985, 1990)).toBe(true);
    expect(isVisibleAtYear(1900, 2020)).toBe(true);
  });

  it("returns false when vintage is after year", () => {
    expect(isVisibleAtYear(2020, 1990)).toBe(false);
    expect(isVisibleAtYear(2010, 2009)).toBe(false);
  });
});

describe("isVisibleAsOf", () => {
  it("hides nothing at the latest year, even a vintage newer than any pinned year could show", () => {
    expect(isVisibleAsOf(2024, 2024, 2024)).toBe(true);
    expect(isVisibleAsOf(9999, 2024, 2024)).toBe(true);
    expect(isVisibleAsOf(null, 2024, 2024)).toBe(true);
  });

  it("also shows everything if year is somehow past latestYear (defensive)", () => {
    expect(isVisibleAsOf(2030, 2025, 2024)).toBe(true);
  });

  it("falls back to isVisibleAtYear for a pinned historical year", () => {
    expect(isVisibleAsOf(2010, 2005, 2024)).toBe(false);
    expect(isVisibleAsOf(2000, 2005, 2024)).toBe(true);
    expect(isVisibleAsOf(null, 2005, 2024)).toBe(true);
  });

  it("a vintage after the pinned year but not after latestYear still hides", () => {
    // Distinguishes isVisibleAsOf from a naive "always show if <= latestYear".
    expect(isVisibleAsOf(2015, 2010, 2024)).toBe(false);
  });
});
