import { describe, expect, it } from "vitest";
import {
  MARK_SPAN_DEG,
  SCENARIO_MIN_SPAN_DEG,
  growToMinimumSpan,
  markBounds,
  scenarioFitBounds,
  topExposedIso3,
  unionBounds,
} from "@/components/scenarios/fit";
import type { Bounds } from "@/lib/state";

const imp = (iso3: string, atRiskQty: number) => ({ iso3, atRiskQty });

describe("topExposedIso3", () => {
  it("ranks by volume at risk, not by share", () => {
    // The 100 %-exposed micro-importer must not displace the big buyers.
    const rows = [
      imp("JPN", 40_000_000),
      imp("MLT", 900), // 100 % of a rounding error
      imp("KOR", 30_000_000),
      imp("IND", 50_000_000),
    ];
    expect(topExposedIso3(rows, 3)).toEqual(["IND", "JPN", "KOR"]);
  });

  it("drops importers with nothing at risk and caps at n", () => {
    const rows = [imp("A", 5), imp("B", 0), imp("C", 4), imp("D", 3)];
    expect(topExposedIso3(rows, 8)).toEqual(["A", "C", "D"]);
    expect(topExposedIso3(rows, 2)).toEqual(["A", "C"]);
  });

  it("does not mutate its input", () => {
    const rows = [imp("A", 1), imp("B", 9)];
    topExposedIso3(rows);
    expect(rows.map((r) => r.iso3)).toEqual(["A", "B"]);
  });
});

describe("unionBounds", () => {
  it("is null for no boxes", () => {
    expect(unionBounds([])).toBeNull();
  });

  it("unions ordinary boxes without wrapping", () => {
    // Portugal-ish and Japan-ish: the honest frame is Europe → east Asia.
    const prt: Bounds = [-9, 37, -6, 42];
    const jpn: Bounds = [129, 31, 146, 45];
    expect(unionBounds([prt, jpn])).toEqual([-9, 31, 146, 45]);
  });

  it("wraps across the antimeridian when that is the narrower frame", () => {
    const fiji: Bounds = [177, -19, 180, -16];
    const samoa: Bounds = [-173, -14, -171, -13];
    const b = unionBounds([fiji, samoa]);
    expect(b).not.toBeNull();
    if (!b) throw new Error("unreachable");
    // 177 → 189 (i.e. -171), not 177 → -173 read the long way round.
    expect(b[0]).toBeCloseTo(177, 6);
    expect(b[2]).toBeCloseTo(189, 6);
    expect(b[2] - b[0]).toBeLessThan(180);
  });

  it("leaves a wide but ordinary union alone", () => {
    // CAN + USA: already far wider than the minimum, and both are western,
    // so the shifted candidate is the same width and must not be preferred.
    const can: Bounds = [-141, 41, -52, 70];
    const usa: Bounds = [-125, 25, -66, 49];
    expect(unionBounds([can, usa])).toEqual([-141, 25, -52, 70]);
  });

  it("grows a tiny union to the minimum extent, so a fit is never street level", () => {
    const tiny: Bounds = [4.2, 51.8, 4.6, 52.1];
    const b = unionBounds([tiny]);
    if (!b) throw new Error("unreachable");
    expect(b[2] - b[0]).toBeCloseTo(SCENARIO_MIN_SPAN_DEG, 6);
    expect(b[3] - b[1]).toBeCloseTo(SCENARIO_MIN_SPAN_DEG, 6);
    // Still centred on what it was asked to frame.
    expect((b[0] + b[2]) / 2).toBeCloseTo(4.4, 6);
  });
});

describe("growToMinimumSpan", () => {
  it("does not clamp longitude to ±180 (a wrapped union runs past it)", () => {
    expect(growToMinimumSpan([178, 0, 180, 2], 10)).toEqual([174, -4, 184, 6]);
  });

  it("clamps latitude to the Mercator limit", () => {
    const [, s, , n] = growToMinimumSpan([0, -84, 10, 84], 40);
    expect(s).toBeGreaterThan(-90);
    expect(n).toBeLessThan(90);
  });
});

describe("scenarioFitBounds", () => {
  it("frames the mark alone when no importer has a polygon", () => {
    expect(markBounds({ lon: 56.25, lat: 26.57 })).toEqual([
      56.25 - MARK_SPAN_DEG / 2,
      26.57 - MARK_SPAN_DEG / 2,
      56.25 + MARK_SPAN_DEG / 2,
      26.57 + MARK_SPAN_DEG / 2,
    ]);
    const b = scenarioFitBounds([{ lon: 56.25, lat: 26.57 }], []);
    if (!b) throw new Error("unreachable");
    expect(b[2] - b[0]).toBeCloseTo(SCENARIO_MIN_SPAN_DEG, 6);
  });

  it("holds the mark and the exposed importers together", () => {
    const hormuz = { lon: 56.25, lat: 26.57 };
    const jpn: Bounds = [129, 31, 146, 45];
    const nld: Bounds = [3, 50, 7, 54];
    const b = scenarioFitBounds([hormuz], [jpn, nld]);
    expect(b).toEqual([3, 23.57, 146, 54]);
  });

  it("is null when there is neither a mark nor an importer box", () => {
    expect(scenarioFitBounds([], [])).toBeNull();
  });
});
