import { describe, it, expect } from "vitest";
import {
  EXPOSURE_LEGEND_STOPS,
  LEGEND,
  exposureColor,
  gradientCss,
  lngTerminalColor,
  lngTerminalSize,
  pipelineColor,
  refineryColor,
  refineryRadius,
  reservesRampColor,
  rgbaCss,
  voyageTargetColor,
  voyageWidth,
  type LayerKey,
} from "@/lib/symbology";
import { legendItems } from "@/components/layers/Legend";
import type { LayerState } from "@/components/layers/LayerPanel";

const ALL_LAYER_KEYS: readonly LayerKey[] = [
  "reserves",
  "basins",
  "extraction",
  "pipelines",
  "refineries",
  "storage",
  "ports",
  "gas_pipelines",
  "lng_terminals",
  "lng_voyages",
];

function monotonic(xs: readonly number[], dir: "up" | "down"): boolean {
  return xs.every((x, i) => i === 0 || (dir === "up" ? x > (xs[i - 1] ?? x) : x < (xs[i - 1] ?? x)));
}

const TS = [0, 0.1, 0.25, 0.5, 0.75, 1];
const luminance = ([r, g, b]: readonly number[]) => 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);

describe("ramps are monotonic", () => {
  it("reserves ramp darkens with t", () => {
    expect(monotonic(TS.map((t) => luminance(reservesRampColor(t))), "down")).toBe(true);
  });

  it("exposure ramp darkens and becomes more opaque with share", () => {
    const cs = TS.slice(1).map((t) => exposureColor(t) ?? [0, 0, 0, 0]);
    expect(monotonic(cs.map(luminance), "down")).toBe(true);
    expect(monotonic(cs.map((c) => c[3]), "up")).toBe(true);
  });

  it("asset at-risk reds deepen with share", () => {
    expect(monotonic(TS.slice(1).map((t) => refineryColor(t)[0]), "up")).toBe(true);
    expect(monotonic(TS.slice(1).map((t) => voyageTargetColor(t)[0]), "up")).toBe(true);
    const lng = TS.slice(1).map((t) => lngTerminalColor({ shareAtRisk: t, coverage: "measured" })[0]);
    expect(monotonic(lng, "up")).toBe(true);
  });

  it("size rules grow with capacity / cargo", () => {
    const caps = [0, 1, 10, 100, 1000];
    expect(monotonic(caps.map(refineryRadius), "up")).toBe(true);
    expect(monotonic(caps.map(lngTerminalSize), "up")).toBe(true);
    expect(monotonic([1e4, 1e5, 1e6].map(voyageWidth), "up")).toBe(true);
  });
});

describe("colour helpers", () => {
  it("pipeline status is opacity, commodity is hue", () => {
    expect(pipelineColor("crude", "operating")[3]).toBeGreaterThan(pipelineColor("crude", "in-construction")[3]);
    expect(pipelineColor("crude", "operating").slice(0, 3)).not.toEqual(
      pipelineColor("gas", "operating").slice(0, 3),
    );
  });

  it("css helpers", () => {
    expect(rgbaCss([255, 0, 0, 255])).toBe("rgba(255,0,0,1.000)");
    expect(gradientCss(EXPOSURE_LEGEND_STOPS)).toMatch(/^linear-gradient\(to right, rgba/);
  });
});

describe("legend", () => {
  it("has at least one entry for every layer toggle", () => {
    expect(Object.keys(LEGEND).sort()).toEqual([...ALL_LAYER_KEYS].sort());
    for (const k of ALL_LAYER_KEYS) expect(LEGEND[k].length).toBeGreaterThan(0);
  });

  it("draws LNG terminals as triangles and ports as anchors (the shapes on the map)", () => {
    expect(LEGEND.lng_terminals.map((i) => i.swatch.kind)).toEqual(["triangle", "triangle"]);
    expect(LEGEND.ports[0]?.swatch.kind).toBe("anchor");
    expect(LEGEND.pipelines.every((i) => i.swatch.kind === "line")).toBe(true);
  });

  it("uses the map's real pipeline colour", () => {
    const sw = LEGEND.pipelines[0]?.swatch;
    expect(sw?.kind === "line" ? sw.color : null).toEqual(pipelineColor("crude", "operating"));
  });

  it("does not claim size = capacity for refineries without qualification", () => {
    const label = LEGEND.refineries[0]?.label ?? "";
    expect(label).toContain("where known");
  });

  const only = (k: LayerKey): LayerState =>
    Object.fromEntries(ALL_LAYER_KEYS.map((x) => [x, x === k])) as unknown as LayerState;

  it("shows rows only for visible layers", () => {
    const items = legendItems(only("ports"));
    expect(items).toEqual(LEGEND.ports);
    expect(legendItems(Object.fromEntries(ALL_LAYER_KEYS.map((x) => [x, false])) as unknown as LayerState)).toEqual(
      [],
    );
  });

  it("adds the exposure ramp while a scenario is active", () => {
    const items = legendItems(only("reserves"), "crude imports");
    expect(items.some((i) => i.label.includes("share of crude imports at risk"))).toBe(true);
  });
});
