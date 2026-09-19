import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CAMERA_PADDING,
  paddingOffset,
  panelPadding,
  prefersReducedMotion,
  resolvePadding,
  type CameraPadding,
} from "@/lib/state/camera";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePadding", () => {
  it("defaults every side, and fills in only the sides left out", () => {
    expect(resolvePadding()).toEqual(DEFAULT_CAMERA_PADDING);
    expect(resolvePadding({ left: 300 })).toEqual({ ...DEFAULT_CAMERA_PADDING, left: 300 });
  });
});

describe("panelPadding", () => {
  it("clears the left layer panel by default", () => {
    expect(panelPadding({}).left).toBeGreaterThan(288);
  });

  it("clears the right scenario panel only when it is open", () => {
    expect(panelPadding({ right: true }).right).toBeGreaterThan(416);
    expect(panelPadding({}).right).toBeLessThan(100);
  });

  it("keeps the target above the year slider unless told otherwise", () => {
    expect(panelPadding({}).bottom).toBeGreaterThan(100);
    expect(panelPadding({ bottom: false }).bottom).toBeLessThan(100);
  });

  it("clears the country panel, and both right-hand panels when they stack", () => {
    // The country panel docks at right-4 alone and beside the scenario panel
    // when both are open, so "both" is wider than either.
    const country = panelPadding({ country: true }).right;
    const scenario = panelPadding({ right: true }).right;
    const both = panelPadding({ right: true, country: true }).right;
    expect(country).toBeGreaterThan(panelPadding({}).right);
    expect(both).toBeGreaterThan(Math.max(country, scenario));
  });
});

/**
 * Finding 14: `goToAsset` flew with no padding at all, so a ranked refinery
 * landed dead centre — behind the panel that ranked it. `flyTo` honours a
 * padding as a one-shot pixel offset (MapLibre's camera `padding` is sticky
 * and would skew every later interaction).
 */
describe("paddingOffset", () => {
  const pad = (p: Partial<CameraPadding>): CameraPadding => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...p,
  });

  it("is zero for symmetric padding", () => {
    expect(paddingOffset(pad({ left: 100, right: 100, top: 40, bottom: 40 }), 1000, 800)).toEqual([0, 0]);
  });

  it("pushes the target away from the padded side", () => {
    // A wide right-hand panel: the subject moves left of centre.
    expect(paddingOffset(pad({ left: 0, right: 400 }), 1000, 800)).toEqual([-200, 0]);
    // A wide left-hand panel: the subject moves right of centre.
    expect(paddingOffset(pad({ left: 300, right: 0 }), 1000, 800)).toEqual([150, 0]);
    // Controls along the bottom: the subject moves up.
    expect(paddingOffset(pad({ top: 0, bottom: 144 }), 1000, 800)).toEqual([0, -72]);
  });

  it("clamps an offset that would push the subject off screen", () => {
    // Two panels on a phone-width map: at most 40 % of the extent either way.
    expect(paddingOffset(pad({ left: 0, right: 2000 }), 400, 300)).toEqual([-160, 0]);
    expect(paddingOffset(pad({ top: 2000, bottom: 0 }), 400, 300)).toEqual([0, 120]);
  });
});

describe("prefersReducedMotion", () => {
  it("is false when matchMedia is missing or throws", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
    vi.stubGlobal("matchMedia", () => {
      throw new Error("nope");
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reports what the media query says", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }));
    expect(prefersReducedMotion()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });
});
