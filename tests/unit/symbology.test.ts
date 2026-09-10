import { describe, it, expect } from "vitest";
import {
  EXPOSURE_LEGEND_STOPS,
  LEGEND,
  LEGEND_GROUPS,
  LNG_TERMINAL_COLOR,
  REFINERY_FILL,
  legendSections,
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

  it("asset at-risk reds darken with share (and stay red)", () => {
    expect(monotonic(TS.slice(1).map((t) => luminance(refineryColor(t))), "down")).toBe(true);
    expect(monotonic(TS.slice(1).map((t) => luminance(voyageTargetColor(t))), "down")).toBe(true);
    const lng = TS.slice(1).map((t) => luminance(lngTerminalColor({ shareAtRisk: t, coverage: "measured" })));
    expect(monotonic(lng, "down")).toBe(true);
    for (const t of TS.slice(1)) {
      const [r, g, b] = refineryColor(t);
      expect(r).toBeGreaterThan(3 * Math.max(g, b));
    }
  });

  it("muted (scenario) reserves ramp keeps the lightness steps but drops the hue", () => {
    expect(monotonic(TS.map((t) => luminance(reservesRampColor(t, true))), "down")).toBe(true);
    for (const t of TS) {
      const [r, g, b] = reservesRampColor(t, true);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(12);
    }
  });

  it("size rules grow with capacity / cargo", () => {
    const caps = [0, 1, 10, 100, 1000];
    expect(monotonic(caps.map(refineryRadius), "up")).toBe(true);
    expect(monotonic(caps.map(lngTerminalSize), "up")).toBe(true);
    expect(monotonic([1e4, 1e5, 1e6].map(voyageWidth), "up")).toBe(true);
  });
});

describe("colour helpers", () => {
  it("commodity is hue; in construction is the same hue, lighter and more transparent", () => {
    const op = pipelineColor("crude", "operating");
    const ic = pipelineColor("crude", "in-construction");
    expect(op[3]).toBeGreaterThan(ic[3]);
    expect(luminance(ic)).toBeGreaterThan(luminance(op));
    // Same hue family: channel order preserved (r > g > b for the warm oil line).
    expect(ic[0] > ic[1] && ic[1] > ic[2]).toBe(true);
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
    const items = legendItems(only("ports"), undefined, 6);
    expect(items).toEqual(LEGEND.ports);
    expect(legendItems(Object.fromEntries(ALL_LAYER_KEYS.map((x) => [x, false])) as unknown as LayerState)).toEqual(
      [],
    );
  });

  it("adds the exposure ramp while a scenario is active", () => {
    const items = legendItems(only("reserves"), "crude imports");
    expect(items.some((i) => i.label.includes("Share of crude imports at risk"))).toBe(true);
    // No asset rows when no asset layer is visible.
    expect(items.some((i) => i.label.includes("Asset at risk"))).toBe(false);
    expect(legendItems(only("refineries"), "crude imports").some((i) => i.label.includes("Asset at risk"))).toBe(
      true,
    );
  });

  it("groups sections by commodity, in a fixed order", () => {
    const all = Object.fromEntries(ALL_LAYER_KEYS.map((x) => [x, true])) as unknown as LayerState;
    expect(legendSections(all, undefined, 6).map((s) => s.title)).toEqual([
      "Reserves & geology",
      "Oil",
      "Gas",
      "Shipping",
    ]);
    expect(legendSections(all, "LNG imports", 6).map((s) => s.title).at(-1)).toBe("Scenario");
    // Every layer key appears in exactly one group.
    expect(LEGEND_GROUPS.flatMap((g) => g.keys).sort()).toEqual([...ALL_LAYER_KEYS].sort());
  });

  it("notes zoom-gated layers instead of hiding their rows", () => {
    const gated = legendItems(only("storage"), undefined, 2);
    expect(gated[0]?.note).toBe("visible from zoom 4");
    expect(legendItems(only("storage"), undefined, 4)[0]?.note).toBeUndefined();
    expect(legendItems(only("refineries"), undefined, 2)[0]?.note).toBeUndefined();
  });

  it("legend swatches are the map's own colours", () => {
    const refinery = LEGEND.refineries[0]?.swatch;
    expect(refinery?.kind === "dot" ? refinery.color : null).toEqual(REFINERY_FILL);
    const lng = LEGEND.lng_terminals[0]?.swatch;
    expect(lng?.kind === "triangle" ? lng.color : null).toEqual(LNG_TERMINAL_COLOR);
    const gas = LEGEND.gas_pipelines[1]?.swatch;
    expect(gas?.kind === "line" ? gas.color : null).toEqual(pipelineColor("gas", "in-construction"));
  });
});
