import { describe, expect, it } from "vitest";
import { buildSearchItems, type SearchSources } from "@/lib/search/build";
import type { AssetsByKind } from "@/lib/data/assets";
import type { CountryCollection } from "@/lib/geo/countries";
import type { BasinCollection } from "@/components/layers/BasinPolygonsLayer";
import type { PipelineCollection } from "@/components/layers/PipelinesLayer";
import type { ShaleRegionCollection } from "@/lib/data/shale-regions";

const countries: CountryCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso3: "JPN", name: "Japan" },
      geometry: { type: "Polygon", coordinates: [[[139, 35], [140, 35], [140, 36], [139, 36], [139, 35]]] },
    },
  ],
};

const emptyAssets: AssetsByKind = {
  extraction: [],
  refinery: [],
  lngExport: [],
  lngImport: [],
  storage: [],
  port: [],
};

const assets: AssetsByKind = {
  ...emptyAssets,
  refinery: [
    {
      asset_id: "R1",
      kind: "refinery",
      name: "Sakai Refinery",
      country_iso3: "JPN",
      lon: 135.4,
      lat: 34.55,
      capacity: null,
      capacity_unit: null,
      operator: "Cosmo Oil",
      status: null,
      commissioned_year: null,
      source: null,
    },
  ],
  lngImport: [
    {
      asset_id: "L1",
      kind: "lng_import",
      name: "Futtsu LNG Terminal",
      country_iso3: "JPN",
      lon: 139.821331,
      lat: 35.345172,
      capacity: 22.9,
      capacity_unit: "mtpa",
      operator: null,
      status: null,
      commissioned_year: null,
      source: null,
      unit_count: null,
      total_processed_bcm: null,
      un_locode: null,
    },
  ],
};

const pipelines: PipelineCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        pipeline_id: "P0001",
        name: "Alberta Clipper Oil Pipeline",
        status: "operating",
        commodity: "crude",
        capacity_kbpd: 450,
        operator: "Enbridge",
        start_year: 2010,
        start_country_iso3: "CAN",
        end_country_iso3: "USA",
      },
      geometry: { type: "LineString", coordinates: [[-113, 53], [-96, 49]] },
    },
    {
      // Unnamed pipelines are not searchable.
      type: "Feature",
      properties: {
        pipeline_id: "P9999",
        name: "",
        status: "operating",
        commodity: "gas",
        capacity_kbpd: null,
        operator: null,
        start_year: null,
      },
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    },
  ],
};

const basins: BasinCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { basin_id: "B1", name: "Permian Basin", country_iso3: "USA", area_km2: 1000, region: "North America" },
      geometry: { type: "Polygon", coordinates: [[[-102, 31], [-100, 31], [-100, 33], [-102, 33], [-102, 31]]] },
    },
    {
      // Unnamed basins are not searchable.
      type: "Feature",
      properties: { basin_id: "B2", name: null, country_iso3: "USA", area_km2: 500, region: "North America" },
      geometry: { type: "Polygon", coordinates: [[[-90, 30], [-89, 30], [-89, 31], [-90, 31], [-90, 30]]] },
    },
  ],
};

const shaleRegions: ShaleRegionCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { region_id: "permian", name: "Permian", counties: 55 },
      geometry: { type: "Polygon", coordinates: [[[-103, 31], [-101, 31], [-101, 33], [-103, 33], [-103, 31]]] },
    },
  ],
};

const sources: SearchSources = { countries, assets, pipelines, basins, shaleRegions };

describe("buildSearchItems", () => {
  it("indexes every source kind", () => {
    const items = buildSearchItems(sources);
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds).toEqual(
      new Set(["country", "refinery", "lng_import", "pipeline_oil", "basin", "shale_region"]),
    );
  });

  it("builds a focusable country target from its iso3", () => {
    const items = buildSearchItems(sources);
    const japan = items.find((i) => i.kind === "country");
    expect(japan?.name).toBe("Japan");
    expect(japan?.iso3).toBe("JPN");
    expect(japan?.iso3Key).toBe("jpn");
    expect(japan?.target).toEqual({ action: "country", iso3: "JPN" });
  });

  it("builds a flyTo target from an asset's own coordinates", () => {
    const items = buildSearchItems(sources);
    const terminal = items.find((i) => i.name === "Futtsu LNG Terminal");
    expect(terminal?.kind).toBe("lng_import");
    expect(terminal?.countryIso3).toBe("JPN");
    expect(terminal?.target).toMatchObject({
      action: "flyTo",
      lon: 139.821331,
      lat: 35.345172,
      layerKey: "lng_terminals",
    });
  });

  it("skips a pipeline with no name and keeps a named one with a fitBounds target", () => {
    const items = buildSearchItems(sources);
    const pipelineNames = items.filter((i) => i.kind.startsWith("pipeline")).map((i) => i.name);
    expect(pipelineNames).toEqual(["Alberta Clipper Oil Pipeline"]);
    const pipe = items.find((i) => i.name === "Alberta Clipper Oil Pipeline");
    expect(pipe?.kind).toBe("pipeline_oil");
    expect(pipe?.countryIso3).toBe("CAN");
    if (pipe?.target.action !== "fitBounds") throw new Error("expected a fitBounds target");
    expect(pipe.target.layerKey).toBe("pipelines");
    expect(pipe.target.bounds).toHaveLength(4);
  });

  it("skips an unnamed basin and keeps a named one", () => {
    const items = buildSearchItems(sources);
    const basinNames = items.filter((i) => i.kind === "basin").map((i) => i.name);
    expect(basinNames).toEqual(["Permian Basin"]);
  });

  it("gives every shale region a fixed USA country", () => {
    const items = buildSearchItems(sources);
    const region = items.find((i) => i.kind === "shale_region");
    expect(region?.countryIso3).toBe("USA");
  });

  it("precomputes a diacritic- and case-folded nameKey once", () => {
    const items = buildSearchItems(sources);
    for (const i of items) expect(i.nameKey).toBe(i.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  });
});
