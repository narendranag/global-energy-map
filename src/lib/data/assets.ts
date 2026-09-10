import { prewarmDuckDB } from "@/lib/duckdb/bootstrap";
import { query } from "@/lib/duckdb/query";
import { cachedLoader } from "./cache";
import { useAsync } from "./useAsync";

/**
 * One read of `assets.parquet` for every point layer and the scenario engine
 * (R14): all kinds, only the columns something renders or computes with,
 * grouped by kind in memory. Year / vintage filtering happens on these rows,
 * never by re-querying.
 */

// P3: the map page imports this module, so start the DuckDB worker + wasm
// download as soon as the page's JS evaluates — before hydration and the
// first query — overlapping the GeoJSON sidecar fetches. No-op on the server.
prewarmDuckDB();

export type AssetKind =
  | "extraction_site"
  | "refinery"
  | "lng_export"
  | "lng_import"
  | "storage"
  | "port";

interface AssetBase {
  readonly asset_id: string;
  readonly name: string;
  readonly country_iso3: string;
  readonly lon: number;
  readonly lat: number;
  /** In `capacity_unit`; null when the source has no capacity. */
  readonly capacity: number | null;
  readonly capacity_unit: string | null;
  readonly operator: string | null;
  readonly status: string | null;
  readonly commissioned_year: number | null;
  /** Provenance string from the build (e.g. "OpenStreetMap (Overpass)"). */
  readonly source: string | null;
}

export interface ExtractionAsset extends AssetBase {
  readonly kind: "extraction_site";
}
export interface RefineryAsset extends AssetBase {
  readonly kind: "refinery";
}
export interface StorageAsset extends AssetBase {
  readonly kind: "storage";
}
export interface PortAsset extends AssetBase {
  readonly kind: "port";
}
export interface LngTerminalAsset extends AssetBase {
  readonly kind: "lng_export" | "lng_import";
  readonly unit_count: number | null;
  readonly total_processed_bcm: number | null;
  readonly un_locode: string | null;
}

export type Asset =
  | ExtractionAsset
  | RefineryAsset
  | StorageAsset
  | PortAsset
  | LngTerminalAsset;

export interface AssetsByKind {
  readonly extraction: readonly ExtractionAsset[];
  readonly refinery: readonly RefineryAsset[];
  readonly lngExport: readonly LngTerminalAsset[];
  readonly lngImport: readonly LngTerminalAsset[];
  readonly storage: readonly StorageAsset[];
  readonly port: readonly PortAsset[];
}

/** Split asset rows by kind; unknown kinds are dropped. Order is preserved. */
export function groupAssets(rows: readonly Asset[]): AssetsByKind {
  const extraction: ExtractionAsset[] = [];
  const refinery: RefineryAsset[] = [];
  const lngExport: LngTerminalAsset[] = [];
  const lngImport: LngTerminalAsset[] = [];
  const storage: StorageAsset[] = [];
  const port: PortAsset[] = [];
  for (const r of rows) {
    switch (r.kind) {
      case "extraction_site":
        extraction.push(r);
        break;
      case "refinery":
        refinery.push(r);
        break;
      case "lng_export":
        lngExport.push(r);
        break;
      case "lng_import":
        lngImport.push(r);
        break;
      case "storage":
        storage.push(r);
        break;
      case "port":
        port.push(r);
        break;
    }
  }
  return { extraction, refinery, lngExport, lngImport, storage, port };
}

export const loadAssets = cachedLoader(async (): Promise<AssetsByKind> => {
  const res = await query<Asset & Record<string, unknown>>(
    `SELECT asset_id, kind, name, country_iso3, lon, lat, capacity, capacity_unit,
            operator, status, commissioned_year, source,
            unit_count, total_processed_bcm, un_locode
     FROM read_parquet('/data/assets.parquet')
     WHERE lon IS NOT NULL AND lat IS NOT NULL`,
  );
  return groupAssets(res.rows);
});

/**
 * Shared asset rows, or null until loaded. `enabled = false` defers the
 * DuckDB boot + scan until some asset layer (or a scenario) needs it.
 */
export function useAssets(enabled = true): AssetsByKind | null {
  return useAsync(loadAssets, enabled ? [] : null).data;
}
