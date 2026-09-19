import { describe, expect, it } from "vitest";
import {
  sparklineMarker,
  sparklinePath,
  sparklineScale,
  sparklineX,
  sparklineY,
} from "@/lib/viz/sparkline";

describe("sparklineScale", () => {
  it("reports the finite extremes and ignores gaps", () => {
    expect(sparklineScale([null, 4, undefined, 9, Number.NaN], 100, 20, 0)).toMatchObject({
      min: 4,
      max: 9,
      count: 5,
    });
  });

  it("is null when nothing is finite", () => {
    expect(sparklineScale([null, undefined, Number.NaN], 100, 20)).toBeNull();
    expect(sparklineScale([], 100, 20)).toBeNull();
  });
});

describe("sparklineX / sparklineY", () => {
  const scale = sparklineScale([0, 5, 10], 100, 20, 0);

  it("spreads points across the full width", () => {
    if (scale === null) throw new Error("scale");
    expect(sparklineX(scale, 0)).toBe(0);
    expect(sparklineX(scale, 1)).toBe(50);
    expect(sparklineX(scale, 2)).toBe(100);
  });

  it("flips y: the maximum is at the top", () => {
    if (scale === null) throw new Error("scale");
    expect(sparklineY(scale, 10)).toBe(0);
    expect(sparklineY(scale, 0)).toBe(20);
    expect(sparklineY(scale, 5)).toBe(10);
  });

  it("puts a one-point series at the left edge", () => {
    const one = sparklineScale([7], 100, 20, 0);
    if (one === null) throw new Error("scale");
    expect(sparklineX(one, 0)).toBe(0);
  });

  it("centres a flat series instead of pinning it to the floor", () => {
    const flat = sparklineScale([3, 3, 3], 100, 20, 0);
    if (flat === null) throw new Error("scale");
    expect(sparklineY(flat, 3)).toBe(10);
  });

  it("keeps the extremes clear of the box by `inset`", () => {
    const inset = sparklineScale([0, 10], 100, 20, 2);
    if (inset === null) throw new Error("scale");
    expect(sparklineY(inset, 10)).toBe(2);
    expect(sparklineY(inset, 0)).toBe(18);
  });
});

describe("sparklinePath", () => {
  it("draws one subpath through every point", () => {
    expect(sparklinePath([0, 10, 5], 100, 20, 0)).toBe("M0 20 L50 0 L100 10");
  });

  it("breaks the line at a gap rather than bridging it", () => {
    const d = sparklinePath([0, 10, null, 5, 10], 100, 20, 0);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).toBe("M0 20 L25 0 M75 10 L100 0");
  });

  it("keeps an isolated point visible as a zero-length segment", () => {
    expect(sparklinePath([null, 5, null], 100, 20, 0)).toBe("M50 10 h0");
    expect(sparklinePath([1], 100, 20, 0)).toBe("M0 10 h0");
  });

  it("is empty when the series has no finite value", () => {
    expect(sparklinePath([null, undefined], 100, 20)).toBe("");
  });
});

describe("sparklineMarker", () => {
  it("locates the point at an index", () => {
    expect(sparklineMarker([0, 10, 5], 1, 100, 20, 0)).toEqual({ x: 50, y: 0 });
  });

  it("is null for a gap or an out-of-range index", () => {
    expect(sparklineMarker([0, null, 5], 1, 100, 20, 0)).toBeNull();
    expect(sparklineMarker([0, 1], 5, 100, 20, 0)).toBeNull();
    expect(sparklineMarker([0, 1], -1, 100, 20, 0)).toBeNull();
  });
});
