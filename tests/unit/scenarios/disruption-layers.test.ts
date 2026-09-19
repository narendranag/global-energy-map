import { describe, expect, it } from "vitest";
import {
  DISRUPTION_CUT_CASING_LAYER_ID,
  DISRUPTION_CUT_LAYER_ID,
  DISRUPTION_MARK_DOT_LAYER_ID,
  DISRUPTION_MARK_HALO_LAYER_ID,
  DISRUPTION_MARK_LAYER_ID,
  buildDisruptionLayers,
  cutFeatures,
  disruptionMarkDatum,
  formatDisruptionTooltip,
  routeMidpoint,
} from "@/components/scenarios/disruption-layers";
import type { PipelineCollection, PipelineProps } from "@/components/layers/PipelinesLayer";
import type { ScenarioDef } from "@/lib/scenarios/registry";
import { DISRUPTION_COLOR, DISRUPTION_MUTED_COLOR } from "@/lib/symbology";

function props(pipeline_id: string, start_year: number | null): PipelineProps {
  return {
    pipeline_id,
    name: pipeline_id,
    status: "operating",
    commodity: "crude",
    capacity_kbpd: null,
    capacity_unit: null,
    operator: null,
    start_year,
  };
}

const PIPELINES: PipelineCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: props("P0001", 2030), // a start year far past any slider value
      geometry: { type: "LineString", coordinates: [[0, 0], [10, 0], [20, 0]] },
    },
    {
      type: "Feature",
      properties: props("P0002", null),
      geometry: { type: "LineString", coordinates: [[0, 5], [1, 5]] }, // a short spur
    },
    {
      type: "Feature",
      properties: props("P9999", 1980),
      geometry: { type: "LineString", coordinates: [[50, 50], [60, 50]] },
    },
  ],
};

const CHOKEPOINT: ScenarioDef = {
  id: "hormuz",
  label: "Close Test Strait",
  kind: "chokepoint",
  commodities: ["oil"],
  description: "A strait.",
  routeName: "the Test Strait",
  location: { lon: 56.25, lat: 26.57 },
};

const PIPELINE_SCENARIO: ScenarioDef = {
  id: "druzhba",
  label: "Cut Test Pipeline",
  kind: "pipeline",
  commodities: ["oil"],
  description: "A pipeline.",
  routeName: "the Test Pipeline",
  pipelineIds: ["P0001", "P0002"],
};

const YEAR = 2020;

describe("cutFeatures", () => {
  it("keeps exactly the route's features, whatever their vintage", () => {
    // P0001's start year is after the slider year: the ordinary pipelines
    // layer would hide it. The route *is* the scenario, so it stays.
    const fc = cutFeatures(PIPELINES, ["P0001", "P0002"]);
    expect(fc.features.map((f) => f.properties.pipeline_id)).toEqual(["P0001", "P0002"]);
  });

  it("ignores ids that are not in the sidecar", () => {
    expect(cutFeatures(PIPELINES, ["nope"]).features).toEqual([]);
  });
});

describe("routeMidpoint", () => {
  it("is halfway along the longest line, not on an endpoint", () => {
    expect(routeMidpoint(cutFeatures(PIPELINES, ["P0001", "P0002"]))).toEqual({
      lon: 10,
      lat: 0,
    });
  });

  it("is null when the route has no geometry", () => {
    expect(routeMidpoint({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});

describe("disruptionMarkDatum", () => {
  it("uses the chokepoint's own location", () => {
    const d = disruptionMarkDatum(CHOKEPOINT, { commodity: "oil", year: YEAR, pipelines: null });
    expect(d).toMatchObject({ lon: 56.25, lat: 26.57, kind: "chokepoint", inactiveNote: null });
  });

  it("places a pipeline scenario's mark on its route", () => {
    const d = disruptionMarkDatum(PIPELINE_SCENARIO, {
      commodity: "oil",
      year: YEAR,
      pipelines: PIPELINES,
    });
    expect(d).toMatchObject({ lon: 10, lat: 0, kind: "pipeline" });
  });

  it("is null while a pipeline scenario's geometry is still loading", () => {
    expect(
      disruptionMarkDatum(PIPELINE_SCENARIO, { commodity: "oil", year: YEAR, pipelines: null }),
    ).toBeNull();
  });

  it("carries the commodity-specific description", () => {
    const def: ScenarioDef = {
      ...CHOKEPOINT,
      descriptionByCommodity: { gas: "An LNG strait." },
    };
    expect(
      disruptionMarkDatum(def, { commodity: "gas", year: YEAR, pipelines: null })?.description,
    ).toBe("An LNG strait.");
  });

  it("carries the inactive note in a year the scenario does not describe", () => {
    const def: ScenarioDef = {
      ...CHOKEPOINT,
      activeYears: { from: 2014, to: 2018 },
      inactiveNote: "The route did not carry this crude before 2014.",
    };
    expect(
      disruptionMarkDatum(def, { commodity: "oil", year: 2010, pipelines: null })?.inactiveNote,
    ).toBe("The route did not carry this crude before 2014.");
    expect(
      disruptionMarkDatum(def, { commodity: "oil", year: 2016, pipelines: null })?.inactiveNote,
    ).toBeNull();
  });
});

describe("buildDisruptionLayers", () => {
  it("draws just the glyph for a chokepoint", () => {
    const ids = buildDisruptionLayers(CHOKEPOINT, {
      commodity: "oil",
      year: YEAR,
      pipelines: null,
    }).map((l) => l.id);
    expect(ids).toEqual([
      DISRUPTION_MARK_HALO_LAYER_ID,
      DISRUPTION_MARK_LAYER_ID,
      DISRUPTION_MARK_DOT_LAYER_ID,
    ]);
  });

  it("draws the cased cut route beneath the glyph for a pipeline scenario", () => {
    const ids = buildDisruptionLayers(PIPELINE_SCENARIO, {
      commodity: "oil",
      year: YEAR,
      pipelines: PIPELINES,
    }).map((l) => l.id);
    expect(ids).toEqual([
      DISRUPTION_CUT_CASING_LAYER_ID,
      DISRUPTION_CUT_LAYER_ID,
      DISRUPTION_MARK_HALO_LAYER_ID,
      DISRUPTION_MARK_LAYER_ID,
      DISRUPTION_MARK_DOT_LAYER_ID,
    ]);
  });

  it("makes only the ring pickable, so the glyph carries one tooltip", () => {
    const layers = buildDisruptionLayers(CHOKEPOINT, {
      commodity: "oil",
      year: YEAR,
      pipelines: null,
    });
    expect(layers.filter((l) => l.props.pickable).map((l) => l.id)).toEqual([
      DISRUPTION_MARK_LAYER_ID,
    ]);
  });

  it("mutes the mark in a year outside the scenario's active range", () => {
    const def: ScenarioDef = {
      ...CHOKEPOINT,
      activeYears: { from: 2014 },
      inactiveNote: "Not yet in service.",
    };
    const colourOf = (year: number) => {
      const dot = buildDisruptionLayers(def, { commodity: "oil", year, pipelines: null }).find(
        (l) => l.id === DISRUPTION_MARK_DOT_LAYER_ID,
      );
      return (dot?.props as { getFillColor?: unknown } | undefined)?.getFillColor;
    };
    expect(colourOf(2016)).toEqual([...DISRUPTION_COLOR]);
    expect(colourOf(2010)).toEqual([...DISRUPTION_MUTED_COLOR]);
  });

  it("draws nothing for a scenario with neither a location nor a route", () => {
    const bare: ScenarioDef = { ...CHOKEPOINT };
    delete (bare as { location?: unknown }).location;
    expect(buildDisruptionLayers(bare, { commodity: "oil", year: YEAR, pipelines: null })).toEqual(
      [],
    );
  });
});

describe("formatDisruptionTooltip", () => {
  it("names the scenario, the route and the description", () => {
    const d = disruptionMarkDatum(CHOKEPOINT, { commodity: "oil", year: YEAR, pipelines: null });
    if (!d) throw new Error("unreachable");
    expect(formatDisruptionTooltip(d)).toBe(
      "Scenario: Close Test Strait\nChokepoint closed: the Test Strait\nA strait.",
    );
  });

  it("says so when the year is outside the modelled range", () => {
    const def: ScenarioDef = {
      ...CHOKEPOINT,
      activeYears: { from: 2014 },
      inactiveNote: "Opened in 2014.",
    };
    const d = disruptionMarkDatum(def, { commodity: "oil", year: 2010, pipelines: null });
    if (!d) throw new Error("unreachable");
    expect(formatDisruptionTooltip(d)).toContain("Not modelled in this year: Opened in 2014.");
  });
});
