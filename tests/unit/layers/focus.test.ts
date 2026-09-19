import { describe, expect, it } from "vitest";
import type { PickingInfo } from "@deck.gl/core";
import type { GeoJsonLayer } from "@deck.gl/layers";
import {
  COUNTRY_LAYER_IDS,
  COUNTRY_PICK_LAYER_ID,
  buildCountryPickLayer,
  countryFromPick,
} from "@/components/layers/CountryPickLayer";
import {
  FOCUS_HALO_LAYER_ID,
  FOCUS_LAYER_ID,
  buildFocusLayer,
  focusFeatures,
} from "@/components/layers/FocusOutlineLayer";
import { DECK_LAYER_IDS, formatTooltip } from "@/components/layers/tooltips";
import { LNG_TERMINALS_LAYER_ID } from "@/components/layers/LngTerminalsLayer";
import { PIPELINE_LAYER_IDS } from "@/components/layers/PipelinesLayer";
import { RESERVES_LAYER_ID } from "@/components/layers/ReservesChoropleth";
import { FOCUS_HALO_COLOR, FOCUS_OUTLINE_COLOR } from "@/lib/symbology";
import { COUNTRIES } from "./fixtures";

const ctx = {
  year: 2020,
  commodity: "oil",
  scenario: null,
  overlay: undefined,
  refineryImpacts: undefined,
  lngImpacts: undefined,
} as unknown as Parameters<typeof formatTooltip>[2];

/** A picking info as deck reports it: layer id + picked object. */
function pick(layerId: string | null, object: unknown): PickingInfo {
  return { layer: layerId === null ? null : { id: layerId }, object } as unknown as PickingInfo;
}

const saudi = { properties: { iso3: "SAU", name: "Saudi Arabia" } };

describe("buildCountryPickLayer", () => {
  const layer = buildCountryPickLayer(COUNTRIES);

  it("covers every country, pickable and invisible", () => {
    expect(layer.id).toBe(COUNTRY_PICK_LAYER_ID);
    expect(layer.props.data).toBe(COUNTRIES);
    expect(layer.props.pickable).toBe(true);
    expect(layer.props.stroked).toBe(false);
    expect(layer.props.getFillColor).toEqual([0, 0, 0, 0]);
  });

  it("produces no tooltip of its own, so it cannot cover the layers above it", () => {
    expect(formatTooltip(COUNTRY_PICK_LAYER_ID, saudi, ctx)).toBeNull();
    expect(Object.values(DECK_LAYER_IDS)).not.toContain(COUNTRY_PICK_LAYER_ID);
  });
});

describe("countryFromPick", () => {
  it("reads the country from the invisible pick layer and from every choropleth", () => {
    for (const id of COUNTRY_LAYER_IDS) expect(countryFromPick(pick(id, saudi))).toBe("SAU");
    expect(COUNTRY_LAYER_IDS.has(RESERVES_LAYER_ID)).toBe(true);
  });

  it("ignores a click on a point or line above a country", () => {
    // Asset rows carry an iso3 of their own; the layer id, not the object
    // shape, decides — clicking a terminal must not re-select its country.
    const terminal = { properties: { iso3: "QAT" }, iso3: "QAT", name: "Ras Laffan" };
    expect(countryFromPick(pick(LNG_TERMINALS_LAYER_ID, terminal))).toBeNull();
    expect(countryFromPick(pick(PIPELINE_LAYER_IDS.crude, { properties: { iso3: "RUS" } }))).toBeNull();
  });

  it("returns null for empty sea and for unknown codes", () => {
    expect(countryFromPick(pick(null, null))).toBeNull();
    expect(countryFromPick(pick(COUNTRY_PICK_LAYER_ID, null))).toBeNull();
    expect(countryFromPick(pick(COUNTRY_PICK_LAYER_ID, { properties: { iso3: "ZZZ" } }))).toBeNull();
    expect(countryFromPick(pick(COUNTRY_PICK_LAYER_ID, { properties: {} }))).toBeNull();
  });
});

describe("focusFeatures", () => {
  it("keeps only the focused country", () => {
    expect(focusFeatures(COUNTRIES, "SAU")?.features.map((f) => f.properties.iso3)).toEqual(["SAU"]);
  });

  it("is null with nothing focused, or a country we have no polygon for", () => {
    expect(focusFeatures(COUNTRIES, null)).toBeNull();
    expect(focusFeatures(COUNTRIES, "JPN")).toBeNull();
  });
});

describe("buildFocusLayer", () => {
  it("builds nothing when nothing is focused", () => {
    expect(buildFocusLayer(COUNTRIES, null)).toEqual([]);
  });

  // B1: a focusable country with no polygon in the collection (Singapore in
  // the real file; JPN in this two-country fixture) is drawn as a cased ring
  // at its anchor rather than not at all.
  it("falls back to an anchor ring when the collection has no polygon", () => {
    const built = buildFocusLayer(COUNTRIES, "JPN");
    expect(built.map((l) => l.id)).toEqual([FOCUS_HALO_LAYER_ID, FOCUS_LAYER_ID]);
    expect(buildFocusLayer(COUNTRIES, "SGP").map((l) => l.id)).toEqual([
      FOCUS_HALO_LAYER_ID,
      FOCUS_LAYER_ID,
    ]);
    // A code with no anchor at all (a BACI pseudo-country) still draws nothing.
    expect(buildFocusLayer(COUNTRIES, "S19")).toEqual([]);
  });

  it("returns the halo first and the line on top, with stable ids", () => {
    const built = buildFocusLayer(COUNTRIES, "SAU");
    expect(built.map((l) => l.id)).toEqual([FOCUS_HALO_LAYER_ID, FOCUS_LAYER_ID]);
    const [halo, line] = built as [GeoJsonLayer, GeoJsonLayer];
    expect(halo.props.getLineColor).toEqual([...FOCUS_HALO_COLOR]);
    expect(line.props.getLineColor).toEqual([...FOCUS_OUTLINE_COLOR]);
    expect(halo.props.lineWidthMinPixels).toBeGreaterThan(line.props.lineWidthMinPixels);
  });

  it("is an outline, and never picks or tooltips", () => {
    for (const layer of buildFocusLayer(COUNTRIES, "SAU")) {
      expect(layer.props.filled).toBe(false);
      expect(layer.props.stroked).toBe(true);
      expect(layer.props.pickable).toBe(false);
      expect(formatTooltip(layer.id, saudi, ctx)).toBeNull();
    }
  });
});
