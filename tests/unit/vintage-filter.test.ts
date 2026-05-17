import { describe, it, expect } from "vitest";
import { isVisibleAtYear } from "@/lib/vintage/filter";

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
