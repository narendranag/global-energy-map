import { describe, expect, it } from "vitest";
import {
  LEGEND,
  MIN_ZOOM,
  TIME_AWARE,
  TIME_AWARE_COVERAGE,
  TIME_AWARE_NOTE,
  extractionOpacity,
  glyphScale,
  isZoomGated,
  timeAwareLabel,
  type LayerKey,
} from "@/lib/symbology";

const KEYS = Object.keys(LEGEND) as LayerKey[];

describe("glyphScale", () => {
  it("is 0.7 at world view, 1 from z5, monotonic between", () => {
    expect(glyphScale(0)).toBe(0.7);
    expect(glyphScale(2)).toBe(0.7);
    expect(glyphScale(5)).toBe(1);
    expect(glyphScale(8)).toBe(1);
    const zs = [2, 2.5, 3, 3.5, 4, 4.5, 5];
    for (let i = 1; i < zs.length; i++) {
      expect(glyphScale(zs[i] ?? 0)).toBeGreaterThan(glyphScale(zs[i - 1] ?? 0));
    }
  });

  it("is quantised so tiny zoom jitter does not change layer props", () => {
    expect(glyphScale(3.001)).toBe(glyphScale(3.004));
    expect((glyphScale(3.37) * 100) % 5).toBeCloseTo(0);
  });

  it("tolerates a non-finite zoom", () => {
    expect(glyphScale(Number.NaN)).toBe(0.7);
  });
});

describe("zoom gating", () => {
  it("gates storage and ports below z4 and nothing else", () => {
    expect(MIN_ZOOM).toEqual({ storage: 4, ports: 4 });
    expect(isZoomGated("storage", 3.99)).toBe(true);
    expect(isZoomGated("ports", 2)).toBe(true);
    expect(isZoomGated("storage", 4)).toBe(false);
    for (const k of KEYS.filter((x) => x !== "storage" && x !== "ports")) {
      expect(isZoomGated(k, 0)).toBe(false);
    }
  });

  it("fades extraction in from z3", () => {
    expect(extractionOpacity(2)).toBe(0.5);
    expect(extractionOpacity(4)).toBe(1);
    expect(extractionOpacity(3.25)).toBeGreaterThan(0.5);
    expect(extractionOpacity(3.25)).toBeLessThan(1);
  });
});

describe("TIME_AWARE", () => {
  it("covers every layer toggle", () => {
    expect(Object.keys(TIME_AWARE).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(TIME_AWARE_COVERAGE).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(TIME_AWARE_NOTE).sort()).toEqual([...KEYS].sort());
  });

  it("matches the data (D9)", () => {
    expect(TIME_AWARE).toMatchObject({
      reserves: "yes",
      lng_voyages: "yes",
      pipelines: "partial",
      gas_pipelines: "partial",
      extraction: "partial",
      lng_terminals: "partial",
      refineries: "no",
      storage: "no",
      ports: "no",
      basins: "no",
    });
    expect(TIME_AWARE_COVERAGE.extraction).toBe(22);
    expect(TIME_AWARE_COVERAGE.lng_terminals).toBe(98);
  });

  it("partial layers carry a coverage %, others do not", () => {
    for (const k of KEYS) {
      expect(TIME_AWARE_COVERAGE[k] !== null).toBe(TIME_AWARE[k] === "partial");
    }
  });

  it("badge labels", () => {
    expect(timeAwareLabel("extraction")).toBe("time: 22 %");
    expect(timeAwareLabel("refineries")).toBe("static");
    expect(timeAwareLabel("lng_voyages")).toBe("time: 2020–24");
    expect(timeAwareLabel("reserves")).toBe("time: to 2020");
  });
});
