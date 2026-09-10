import { describe, it, expect } from "vitest";
import { buildBasinsLayer } from "@/components/layers/BasinPolygonsLayer";
import { buildExtractionLayer } from "@/components/layers/ExtractionPoints";
import { buildLngTerminalsLayer } from "@/components/layers/LngTerminalsLayer";
import { buildLngVoyagesLayer } from "@/components/layers/LngVoyagesLayer";
import { buildPipelinesLayer, filterPipelines } from "@/components/layers/PipelinesLayer";
import { buildPortsLayer } from "@/components/layers/PortsLayer";
import { buildRefineriesLayer } from "@/components/layers/RefineriesLayer";
import { buildReservesLayer, reservesFeatures } from "@/components/layers/ReservesChoropleth";
import { buildStorageLayer } from "@/components/layers/StorageLayer";
import { needsAssets } from "@/components/layers/useMapLayers";
import { toReservesData } from "@/lib/data/reserves";
import type { LngImportImpact, RefineryImpact } from "@/lib/scenarios/types";
import {
  LNG_NO_COVERAGE_COLOR,
  LNG_TERMINAL_COLOR,
  REFINERY_FILL,
  RESERVES_NO_DATA_COLOR,
  atRiskColor,
  exposureColor,
  reservesColor,
} from "@/lib/symbology";
import type { LayerState } from "@/components/layers/LayerPanel";
import {
  COUNTRIES,
  extraction,
  lngTerminal,
  pipeline,
  pipelines,
  port,
  refinery,
  storage,
  voyage,
} from "./fixtures";

/** deck.gl accessors are plain functions on props; call one on a row. */
function call(accessor: unknown, row: unknown): unknown {
  return (accessor as (d: unknown) => unknown)(row);
}
function dataLength(layer: { props: { data: unknown } }): number {
  const d = layer.props.data as readonly unknown[] | { features: readonly unknown[] };
  return Array.isArray(d) ? d.length : (d as { features: readonly unknown[] }).features.length;
}

describe("extraction builder", () => {
  it("has a stable id and filters by commissioning year (undated always shown)", () => {
    const rows = [extraction("a", 1990), extraction("b", 2015), extraction("c", null)];
    const l2000 = buildExtractionLayer(rows, 2000);
    expect(l2000.id).toBe("extraction");
    expect(dataLength(l2000)).toBe(2);
    expect(dataLength(buildExtractionLayer(rows, 2020))).toBe(3);
    expect(l2000.props.pickable).toBe(true);
  });
});

describe("pipelines builder", () => {
  const fc = pipelines(
    pipeline("o1", "crude", 1980),
    pipeline("o2", "crude", 2022),
    pipeline("o3", "crude", null),
    pipeline("g1", "gas", 2000),
    pipeline("n1", "ngl", 1990),
    pipeline("cn1", "crude+ngl", null),
  );

  it("keeps one layer group and respects start_year", () => {
    // NGL and crude+NGL lines belong to the oil layer (they were silently dropped before Phase 8).
    expect(filterPipelines(fc, "crude", 2020).features.map((f) => f.properties.pipeline_id)).toEqual([
      "o1",
      "o3",
      "n1",
      "cn1",
    ]);
    expect(filterPipelines(fc, "gas", 1999).features).toHaveLength(0);
  });

  it("uses the stable per-commodity ids", () => {
    const oil = buildPipelinesLayer(fc, "crude", 2024);
    const gas = buildPipelinesLayer(fc, "gas", 2024);
    expect(oil.id).toBe("pipelines-crude");
    expect(gas.id).toBe("pipelines-gas");
    expect(dataLength(oil)).toBe(5);
    expect(dataLength(gas)).toBe(1);
    expect(oil.props.pickable).toBe(true);
  });
});

describe("refineries builder", () => {
  it("keeps all rows and tints only exposed refineries", () => {
    const rows = [refinery("r1"), refinery("r2")];
    const impacts = new Map<string, RefineryImpact>([
      ["r1", { asset_id: "r1", iso3: "USA", capacity: 0, atRiskQty: 1, shareAtRisk: 0.5, topSources: [] }],
    ]);
    const l = buildRefineriesLayer(rows, impacts);
    expect(l.id).toBe("refineries");
    expect(dataLength(l)).toBe(2);
    expect(call(l.props.getFillColor, rows[1])).toEqual([...REFINERY_FILL]);
    expect(call(l.props.getFillColor, rows[0])).toEqual([...atRiskColor(0.5)]);
    expect(l.props.updateTriggers.getFillColor).toEqual([impacts]);
  });

  it("uses the base radius when capacity is not in source", () => {
    const l = buildRefineriesLayer([refinery("r1")]);
    expect(call(l.props.getRadius, refinery("x"))).toBe(3000);
    expect(call(l.props.getRadius, refinery("y", { capacity: 100 }))).toBe(7000);
  });
});

describe("storage / ports / basins builders", () => {
  it("storage", () => {
    const l = buildStorageLayer([storage("s1"), storage("s2"), storage("s3")]);
    expect(l.id).toBe("storage");
    expect(dataLength(l)).toBe(3);
    expect(l.props.visible).toBe(true);
  });

  it("ports", () => {
    const l = buildPortsLayer([port("p1")]);
    expect(l.id).toBe("ports");
    expect(dataLength(l)).toBe(1);
    expect(call(l.props.getSize, port("p", { capacity: null }))).toBe(8);
  });

  it("zoom gating hides storage / ports without dropping their data or id", () => {
    const s = buildStorageLayer([storage("s1")], { visible: false, scale: 0.6 });
    expect(s.id).toBe("storage");
    expect(s.props.visible).toBe(false);
    expect(dataLength(s)).toBe(1);
    const p = buildPortsLayer([port("p1")], { visible: false, scale: 0.6 });
    expect(p.id).toBe("ports");
    expect(p.props.visible).toBe(false);
    expect(p.props.sizeScale).toBeCloseTo(0.6);
  });

  it("basins", () => {
    const l = buildBasinsLayer({ type: "FeatureCollection", features: [] });
    expect(l.id).toBe("basins");
  });
});

describe("LNG terminals builder", () => {
  it("filters by vintage and colours by coverage / exposure", () => {
    const rows = [
      lngTerminal("old", "lng_import", { commissioned_year: 2000 }),
      lngTerminal("new", "lng_export", { commissioned_year: 2030 }),
      lngTerminal("gap"),
    ];
    const impacts = new Map<string, LngImportImpact>([
      [
        "gap",
        {
          asset_id: "gap",
          iso3: "JPN",
          capacity: 1,
          name: "gap",
          atRiskQty: 0,
          shareAtRisk: 0,
          topSources: [],
          dataSource: "lng-t3",
          coverage: "none",
        },
      ],
    ]);
    const l = buildLngTerminalsLayer(rows, 2024, impacts);
    expect(l.id).toBe("lng-terminals");
    expect(dataLength(l)).toBe(2);
    expect(call(l.props.getIcon, rows[1])).toBe("lng_export");
    expect(call(l.props.getColor, rows[0])).toEqual([...LNG_TERMINAL_COLOR]);
    expect(call(l.props.getColor, rows[2])).toEqual([...LNG_NO_COVERAGE_COLOR]);
  });
});

describe("glyph scale", () => {
  it("shrinks pixel clamps / icon size, never data or ids", () => {
    const full = buildRefineriesLayer([refinery("r1")]);
    const small = buildRefineriesLayer([refinery("r1")], undefined, 0.6);
    expect(small.id).toBe(full.id);
    expect(small.props.radiusMinPixels).toBeCloseTo(full.props.radiusMinPixels * 0.6);
    expect(small.props.radiusMaxPixels).toBeCloseTo(full.props.radiusMaxPixels * 0.6);
    const lng = buildLngTerminalsLayer([lngTerminal("t")], 2024, undefined, 0.6);
    expect(lng.props.sizeScale).toBeCloseTo(0.6);
    const ex = buildExtractionLayer([extraction("a")], 2020, { scale: 0.6, opacity: 0.5 });
    expect(ex.props.opacity).toBe(0.5);
    expect(ex.id).toBe("extraction");
  });
});

describe("LNG voyages builder", () => {
  it("draws every positioned voyage with the stable id", () => {
    const l = buildLngVoyagesLayer([voyage(), voyage({ voyage_id: "v2" })]);
    expect(l.id).toBe("lng-voyages");
    expect(dataLength(l)).toBe(2);
    expect(call(l.props.getWidth, voyage({ amount_cbm: 100_000 }))).toBeCloseTo(2);
  });
});

describe("reserves builder", () => {
  const data = toReservesData("oil", 2020, [{ iso3: "SAU", value: 297.5 }]);
  const fc = reservesFeatures(COUNTRIES, data);

  it("attaches value / commodity / data year to each country", () => {
    expect(fc.features[0]?.properties).toMatchObject({ iso3: "SAU", value: 297.5, commodity: "oil", data_year: 2020 });
    expect(fc.features[1]?.properties.value).toBeNull();
  });

  it("keeps the id stable and paints no-data grey / scenario overlay", () => {
    const color = exposureColor(0.5);
    if (!color) throw new Error("expected a colour");
    const overlay = new Map([["SAU", { color, tooltip: "x" }]]);
    const l = buildReservesLayer(fc, data.max, overlay);
    expect(l.id).toBe("reserves");
    expect(dataLength(l)).toBe(2);
    expect(call(l.props.getFillColor, fc.features[1])).toEqual([...RESERVES_NO_DATA_COLOR]);
    expect(call(l.props.getFillColor, fc.features[0])).toEqual([...color]);
  });

  it("mutes the reserves ramp (no hue) while a scenario is active", () => {
    const without = buildReservesLayer(fc, data.max);
    const withScenario = buildReservesLayer(fc, data.max, new Map());
    expect(call(without.props.getFillColor, fc.features[0])).toEqual([...reservesColor(297.5, data.max)]);
    expect(call(withScenario.props.getFillColor, fc.features[0])).toEqual([...reservesColor(297.5, data.max, true)]);
  });
});

describe("needsAssets", () => {
  const none: LayerState = {
    reserves: true,
    basins: true,
    extraction: false,
    pipelines: true,
    refineries: false,
    storage: false,
    ports: false,
    gas_pipelines: true,
    lng_terminals: false,
    lng_voyages: false,
  };
  it("is false for geometry-only views and true for any asset layer or a scenario", () => {
    expect(needsAssets(none, false)).toBe(false);
    expect(needsAssets(none, true)).toBe(true);
    expect(needsAssets({ ...none, storage: true }, false)).toBe(true);
    expect(needsAssets({ ...none, lng_voyages: true }, false)).toBe(true);
  });
});
