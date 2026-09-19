import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CAMERA_PADDING,
  panelPadding,
  prefersReducedMotion,
  resolvePadding,
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
