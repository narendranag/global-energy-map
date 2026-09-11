import { describe, expect, it } from "vitest";
import catalogJson from "../../../public/data/catalog.json";
import type { Catalog } from "@/lib/data-catalog/types";
import type { Asset } from "@/lib/data/assets";
import type { ScenarioResult } from "@/lib/scenarios/types";
import { layerCsv, layerGeoJson } from "@/lib/export/files";
import {
  assetTable,
  enabledLayers,
  layerExportStatus,
  pipelineTable,
  scenarioTags,
  type LayerKey,
} from "@/lib/export/layers";
import { scenarioCsv, scenarioRows, shareCitationLine } from "@/lib/export/scenario";
import type { ShareCitation } from "@/lib/export/citation";

const CATALOG = catalogJson as unknown as Catalog;

describe("layer export policy (shipped catalog)", () => {
  const status = (k: LayerKey, c: "oil" | "gas" = "oil") => layerExportStatus(k, c, CATALOG);

  it("reserves (EI) and refineries (NETL + ODbL OSM) are view-only, with a reason", () => {
    expect(status("reserves").exportable).toBe(false);
    expect(status("reserves").reason).toMatch(/Energy Institute/);
    expect(status("reserves", "gas").exportable).toBe(false);
    expect(status("refineries").exportable).toBe(false);
    expect(status("refineries").reason).toMatch(/OpenStreetMap/);
  });

  it("CC BY / public-domain layers are exportable", () => {
    for (const k of ["extraction", "pipelines", "gas_pipelines", "storage", "ports", "basins", "lng_terminals", "lng_voyages"] as const) {
      expect(status(k).exportable, k).toBe(true);
      expect(status(k).reason).toBeNull();
    }
  });

  it("scenario tags include trade and route shares for every scenario", () => {
    for (const id of ["hormuz", "druzhba", "btc", "cpc"] as const) {
      const ids = CATALOG.entries
        .filter((e) => e.layers.some((l) => scenarioTags(id, "oil").includes(l)))
        .map((e) => e.id);
      expect(ids, id).toEqual(expect.arrayContaining(["baci_2709", "disruption_route"]));
    }
  });

  it("enabledLayers follows panel order", () => {
    const layers = {
      reserves: true, basins: false, extraction: false, pipelines: true, refineries: false,
      storage: false, ports: false, gas_pipelines: true, lng_terminals: false, lng_voyages: false,
    };
    expect(enabledLayers(layers)).toEqual(["reserves", "pipelines", "gas_pipelines"]);
  });
});

const asset = (over: Partial<Asset>): Asset =>
  ({
    asset_id: "A1", kind: "extraction_site", name: "Field", country_iso3: "SAU", lon: 50, lat: 25,
    capacity: null, capacity_unit: null, operator: null, status: "operating",
    commissioned_year: null, source: "GEM", ...over,
  }) as Asset;

describe("layer tables", () => {
  it("filters time-aware assets by vintage like the map (undated always shown)", () => {
    const rows = [asset({ asset_id: "old", commissioned_year: 1980 }), asset({ asset_id: "new", commissioned_year: 2015 }), asset({ asset_id: "undated" })];
    const t = assetTable(rows, { year: 2000, timeAware: true });
    expect(t.rows.map((r) => r.asset_id)).toEqual(["old", "undated"]);
    expect(t.features).toHaveLength(2);
    expect(t.features[0]?.geometry).toEqual({ type: "Point", coordinates: [50, 25] });
    expect(t.features[0]?.properties).not.toHaveProperty("lon");
    expect(assetTable(rows, { year: 2000, timeAware: false }).rows).toHaveLength(3);
  });

  it("splits pipelines by group and year and renames capacity", () => {
    const f = (id: string, commodity: string, start_year: number | null) => ({
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: [[0, 0], [1, 1]] },
      properties: { pipeline_id: id, name: id, status: "operating", commodity, capacity_kbpd: 5, capacity_unit: "kbpd", operator: null, start_year },
    });
    const fs = [f("c1", "crude", 1990), f("n1", "ngl", null), f("g1", "gas", 1990), f("c2", "crude", 2020)];
    const crude = pipelineTable(fs, "crude", 2000);
    expect(crude.rows.map((r) => r.pipeline_id)).toEqual(["c1", "n1"]);
    expect(crude.rows[0]?.capacity).toBe(5);
    expect(pipelineTable(fs, "gas", 2000).rows.map((r) => r.pipeline_id)).toEqual(["g1"]);
  });

  it("CSV and GeoJSON exports cite source, licence, as-of and attribution", () => {
    const st = layerExportStatus("extraction", "oil", CATALOG);
    const t = assetTable([asset({})], { year: 2020, timeAware: true });
    const ctx = { viewUrl: "https://x/?year=2020", exported: "2026-09-10" };
    const csv = layerCsv(st, t, ctx);
    expect(csv).toMatch(/^# Global Energy Map — Extraction sites: features in service by 2020/);
    expect(csv).toContain("# Source: Global Energy Monitor — Oil & gas extraction sites (GEM), as of 2023-07-01. Licence: CC BY 4.0.");
    expect(csv).toContain("# Required attribution: Data: Global Energy Monitor, CC BY 4.0");
    expect(csv).toContain("asset_id,kind,name,country_iso3,lon,lat,");
    const gj = JSON.parse(layerGeoJson(st, t, ctx)) as { type: string; features: unknown[]; metadata: { sources: { license: string }[] } };
    expect(gj.type).toBe("FeatureCollection");
    expect(gj.features).toHaveLength(1);
    expect(gj.metadata.sources[0]?.license).toBe("CC BY 4.0");
  });
});

const RESULT: ScenarioResult = {
  scenarioId: "druzhba",
  commodity: "oil",
  year: 2020,
  byImporter: [
    { iso3: "DEU", totalQty: 1000, atRiskQty: 200, shareAtRisk: 0.2 },
    { iso3: "POL", totalQty: 500, atRiskQty: 250, shareAtRisk: 0.5 },
    { iso3: "S19", totalQty: 0, atRiskQty: 0, shareAtRisk: 0 },
  ],
  rankedImporters: [],
  byRefinery: [
    { asset_id: "r1", iso3: "POL", name: "Plock, \"Orlen\"", capacity: 300, atRiskQty: 250, shareAtRisk: 0.5, topSources: [{ iso3: "RUS", qty: 250 }] },
    { asset_id: "r2", iso3: "DEU", capacity: 0, atRiskQty: 0, shareAtRisk: 0, topSources: [] },
  ],
  rankedRefineries: [],
  byLngImport: [],
  rankedLngImports: [],
};

describe("scenario CSV", () => {
  it("rows: importers by share (zero-import codes dropped), then refineries with risk", () => {
    const rows = scenarioRows(RESULT, new Map([["POL", "Poland"]]));
    expect(rows.map((r) => `${String(r.row_type)}:${String(r.iso3)}`)).toEqual(["importer:POL", "importer:DEU", "refinery:POL"]);
    expect(rows[0]?.country).toBe("Poland");
    expect(rows[1]?.country).toBeNull();
    expect(rows[2]?.capacity_unit).toBe("kbpd");
    expect(rows[2]?.top_sources).toBe("RUS:250");
  });

  it("header marks derived analysis and cites BACI and every route share", () => {
    const unsourced: ShareCitation = { disruption_id: "cpc", kind: "pipeline", exporter_iso3: "RUS", importer_iso3: null, share: 0.035, source_title: "Analyst estimate (unsourced)", source_url: null, source_year: 2026, source_note: null };
    const shares: ShareCitation[] = [
      { disruption_id: "druzhba", kind: "pipeline", exporter_iso3: "RUS", importer_iso3: "POL", share: 0.47, source_title: "IEA report", source_url: "https://iea.example", source_year: 2022, source_note: null },
      unsourced,
    ];
    const csv = scenarioCsv(RESULT, { viewUrl: "https://x/?scenario=druzhba", exported: "2026-09-10", catalog: CATALOG, shares });
    const header = csv.split("\n").filter((l) => l.startsWith("#"));
    expect(header[0]).toBe("# Global Energy Map — scenario table: Cut Druzhba pipeline, crude oil, 2020");
    expect(csv).toContain("DERIVED ANALYSIS");
    expect(csv).toContain("Data: CEPII BACI");
    expect(csv).toContain("Gaulier, G., & Zignago, S. (2010)");
    expect(csv).toContain("#   RUS -> POL: 0.47 — IEA report (2022) https://iea.example");
    expect(csv).not.toContain("0.035"); // other scenario's share not cited
    expect(csv).toContain('"Plock, ""Orlen"""');
    expect(shareCitationLine(unsourced)).toBe("RUS -> all importers: 0.035 — Analyst estimate (unsourced)");
  });

  it("Hormuz on the gas axis cites the LNG shares, with identical pair rows on one line", () => {
    const row = (id: string, exporter: string, importer: string | null, share: number): ShareCitation => ({
      disruption_id: id,
      kind: "chokepoint",
      exporter_iso3: exporter,
      importer_iso3: importer,
      share,
      source_title: "IEA",
      source_url: "https://iea.example",
      source_year: 2026,
      source_note: importer === null ? null : "inside the Gulf",
    });
    const shares = [
      row("hormuz", "ARE", null, 0.65),
      row("hormuz_lng", "ARE", null, 1),
      row("hormuz_lng", "ARE", "KWT", 0),
      row("hormuz_lng", "QAT", "KWT", 0),
    ];
    const gas: ScenarioResult = { ...RESULT, scenarioId: "hormuz", commodity: "gas" };
    const csv = scenarioCsv(gas, { viewUrl: "https://x/", exported: "2026-09-11", catalog: CATALOG, shares });
    expect(csv).toContain("Route shares (disruption_route.parquet, 3 rows; static across years):");
    expect(csv).toContain("#   ARE -> all importers: 1 — IEA (2026) https://iea.example");
    expect(csv).toContain("#   2 pairs (ARE -> KWT, QAT -> KWT): 0 — IEA (2026) https://iea.example");
    expect(csv).not.toContain("0.65"); // the crude share does not apply to LNG
  });
});
