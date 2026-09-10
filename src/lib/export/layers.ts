import type { Feature, Geometry } from "geojson";
import type { Catalog, CatalogEntry } from "@/lib/data-catalog/types";
import type { Asset, LngTerminalAsset } from "@/lib/data/assets";
import type { PositionedVoyage } from "@/lib/data/voyages";
import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import type { AppState } from "@/lib/url-state/encode";
import { isVisibleAtYear } from "@/lib/vintage/filter";
import type { CsvValue } from "./csv";
import { entriesForTags } from "./citation";
import { lineFeatures, pointFeatures, reprojectProps } from "./geojson";

/**
 * Which layers' rows may be exported, and the rows themselves. The licence
 * policy (Phase 9 user decision) is catalog-driven: a layer is exportable only
 * if every catalog entry behind it is `redistributable` (CC BY 4.0, public
 * domain, or project-derived). Reserves (Energy Institute) and refineries
 * (NETL + 88 ODbL OpenStreetMap rows) are therefore view-only.
 */

export type LayerKey = keyof AppState["layers"];

export const LAYER_LABELS: Record<LayerKey, string> = {
  reserves: "Reserves (country)",
  basins: "Basins",
  extraction: "Extraction sites",
  pipelines: "Oil pipelines",
  refineries: "Refineries",
  storage: "Storage hubs",
  ports: "Ports",
  gas_pipelines: "Gas pipelines",
  lng_terminals: "LNG terminals",
  lng_voyages: "LNG voyages",
};

/** Display order in the Share menu (matches the layer panel). */
export const LAYER_ORDER: readonly LayerKey[] = [
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

/** Catalog `layers` tags behind a map layer. */
export function layerTags(key: LayerKey, commodity: Commodity): string[] {
  if (key === "reserves") return commodity === "gas" ? ["reserves", "reserves:gas"] : ["reserves"];
  return [key];
}

/** Catalog tags behind an active scenario (trade, route shares, attributed assets). */
export function scenarioTags(id: ScenarioId, commodity: Commodity): string[] {
  const tag = id === "hormuz" && commodity === "gas" ? "scenario:hormuz-lng" : `scenario:${id}`;
  return [tag, commodity === "gas" ? "lng_terminals" : "refineries"];
}

export function enabledLayers(layers: AppState["layers"]): LayerKey[] {
  return LAYER_ORDER.filter((k) => layers[k]);
}

export interface LayerExportStatus {
  readonly key: LayerKey;
  readonly label: string;
  readonly exportable: boolean;
  /** Why the layer is view-only (null when exportable). */
  readonly reason: string | null;
  readonly entries: readonly CatalogEntry[];
}

export function layerExportStatus(
  key: LayerKey,
  commodity: Commodity,
  catalog: Catalog,
): LayerExportStatus {
  const entries = entriesForTags(layerTags(key, commodity), catalog);
  const label = LAYER_LABELS[key];
  if (entries.length === 0) {
    return { key, label, exportable: false, reason: "No catalogued source.", entries };
  }
  const blockers = entries.filter((e) => e.redistributable !== true);
  if (blockers.length === 0) return { key, label, exportable: true, reason: null, entries };
  const reason = blockers
    .map((b) => `${b.source_name}: ${b.download_note ?? b.license}`)
    .join(" ");
  return { key, label, exportable: false, reason: `View-only. ${reason}`, entries };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface ExportTable {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, CsvValue>[];
  readonly features: readonly Feature[];
  /** Filter applied, for the file header (e.g. "in service by 2020 (undated included)"). */
  readonly filter: string | null;
}

const ASSET_COLUMNS = [
  "asset_id",
  "kind",
  "name",
  "country_iso3",
  "lon",
  "lat",
  "capacity",
  "capacity_unit",
  "operator",
  "status",
  "commissioned_year",
  "source",
] as const;

const LNG_COLUMNS = [...ASSET_COLUMNS, "unit_count", "total_processed_bcm", "un_locode"] as const;

function vintageFilter(year: number): string {
  return `features in service by ${String(year)} (undated features included)`;
}

/**
 * Point asset rows as shown: time-aware kinds (extraction sites, LNG
 * terminals) are filtered by `commissioned_year` like the map; others are not.
 */
export function assetTable(
  rows: readonly Asset[],
  opts: { readonly year: number; readonly timeAware: boolean; readonly lng?: boolean },
): ExportTable {
  const shown = opts.timeAware ? rows.filter((r) => isVisibleAtYear(r.commissioned_year, opts.year)) : rows;
  const columns: readonly string[] = opts.lng ? LNG_COLUMNS : ASSET_COLUMNS;
  const records = shown.map((r) => {
    const rec: Record<string, CsvValue> = {};
    const src = r as unknown as Record<string, unknown>;
    for (const c of columns) rec[c] = (src[c] ?? null) as CsvValue;
    return rec;
  });
  return {
    columns,
    rows: records,
    features: pointFeatures(records, columns.filter((c) => c !== "lon" && c !== "lat")),
    filter: opts.timeAware ? vintageFilter(opts.year) : null,
  };
}

export interface PipelineLikeProps extends Record<string, unknown> {
  readonly pipeline_id: string;
  readonly name: string | null;
  readonly status: string | null;
  readonly commodity: string;
  readonly capacity_kbpd: number | null;
  readonly capacity_unit?: string | null;
  readonly start_country_iso3?: string | null;
  readonly end_country_iso3?: string | null;
  readonly operator: string | null;
  readonly start_year: number | null;
}

const PIPELINE_COLUMNS = [
  "pipeline_id",
  "name",
  "status",
  "commodity",
  "capacity",
  "capacity_unit",
  "start_country_iso3",
  "end_country_iso3",
  "operator",
  "start_year",
] as const;

/** Oil (crude/NGL) or gas pipelines in service by `year`, as the map shows them. */
export function pipelineTable(
  features: readonly Feature<Geometry, PipelineLikeProps>[],
  group: "crude" | "gas",
  year: number,
): ExportTable {
  const shown = features.filter(
    (f) =>
      (f.properties.commodity === "gas" ? "gas" : "crude") === group &&
      isVisibleAtYear(f.properties.start_year, year),
  );
  // `capacity_kbpd` holds capacity in `capacity_unit` (bcm/y for gas): export it as `capacity`.
  const renamed = shown.map((f) => ({
    ...f,
    properties: { ...f.properties, capacity: f.properties.capacity_kbpd },
  }));
  const features2 = reprojectProps(renamed, PIPELINE_COLUMNS);
  return {
    columns: PIPELINE_COLUMNS,
    rows: features2.map((f) => (f.properties ?? {}) as Record<string, CsvValue>),
    features: features2,
    filter: vintageFilter(year),
  };
}

export interface BasinLikeProps extends Record<string, unknown> {
  readonly basin_id: string;
  readonly name: string | null;
  readonly country_iso3: string | null;
  readonly area_km2: number | null;
  readonly region: string | null;
}

const BASIN_COLUMNS = ["basin_id", "name", "country_iso3", "area_km2", "region"] as const;

export function basinTable(features: readonly Feature<Geometry, BasinLikeProps>[]): ExportTable {
  const fs = reprojectProps(features, BASIN_COLUMNS);
  return {
    columns: BASIN_COLUMNS,
    rows: fs.map((f) => (f.properties ?? {}) as Record<string, CsvValue>),
    features: fs,
    filter: null,
  };
}

const VOYAGE_COLUMNS = [
  "voyage_id",
  "start_date",
  "end_date",
  "imo",
  "from_terminal",
  "from_country_iso3",
  "to_terminal",
  "to_country_iso3",
  "amount_cbm",
  "confidence_score",
  "from_lon",
  "from_lat",
  "to_lon",
  "to_lat",
] as const;

/** Loaded-cargo voyages active in `year` (confidence >= 3), terminal-to-terminal lines. */
export function voyageTable(voyages: readonly PositionedVoyage[], year: number): ExportTable {
  const rows = voyages.map((v) => {
    const src = v as unknown as Record<string, unknown>;
    const rec: Record<string, CsvValue> = {};
    for (const c of VOYAGE_COLUMNS) rec[c] = (src[c] ?? null) as CsvValue;
    return rec;
  });
  return {
    columns: VOYAGE_COLUMNS,
    rows,
    features: lineFeatures(
      rows,
      VOYAGE_COLUMNS.filter((c) => !c.endsWith("_lon") && !c.endsWith("_lat")),
      { fromLon: "from_lon", fromLat: "from_lat", toLon: "to_lon", toLat: "to_lat" },
    ),
    filter: `export voyages active in ${String(year)} with LNG-T3 confidence >= 3; drawn as straight terminal-to-terminal lines`,
  };
}

/** All LNG terminal rows (export + import berths), as the terminal layer draws them. */
export function lngTerminalRows(
  lngExport: readonly LngTerminalAsset[],
  lngImport: readonly LngTerminalAsset[],
): LngTerminalAsset[] {
  return [...lngExport, ...lngImport];
}
