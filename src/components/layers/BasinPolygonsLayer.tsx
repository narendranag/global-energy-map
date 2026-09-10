import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { cachedLoader, fetchJson } from "@/lib/data/cache";
import { sourceLine } from "@/lib/data/sources";
import { BASIN_FILL, BASIN_LINE, BASIN_LINE_MIN_PX } from "@/lib/symbology";
import { joinLines, orNa, type TooltipFormatter } from "./tooltip";

export const BASINS_LAYER_ID = "basins";

export interface BasinProps extends Record<string, unknown> {
  basin_id: string;
  name: string | null;
  country_iso3: string | null;
  area_km2: number | null;
  region: string | null;
}

export type BasinFeature = Feature<Polygon | MultiPolygon, BasinProps>;
export type BasinCollection = FeatureCollection<Polygon | MultiPolygon, BasinProps>;

/**
 * basins.geojson sidecar (build_basins.py). The GeoJSON sidecar is read
 * instead of basins GeoParquet because DuckDB-WASM's spatial extension is not
 * reliably available in the dev build we pin.
 */
export const loadBasins = cachedLoader(() => fetchJson<BasinCollection>("/data/basins.geojson"));

export function buildBasinsLayer(fc: BasinCollection): GeoJsonLayer<BasinProps> {
  return new GeoJsonLayer<BasinProps>({
    id: BASINS_LAYER_ID,
    data: fc,
    stroked: true,
    filled: true,
    getFillColor: [...BASIN_FILL],
    getLineColor: [...BASIN_LINE],
    lineWidthMinPixels: BASIN_LINE_MIN_PX,
    pickable: true,
  });
}

export const formatBasinTooltip: TooltipFormatter<BasinFeature> = (f) => {
  const p = f.properties;
  const area = p.area_km2;
  return joinLines(
    `Basin: ${p.name ?? (p.basin_id || "unnamed")}`,
    `Country: ${orNa(p.country_iso3)}`,
    `Area: ${typeof area === "number" && area > 0 ? `${area.toFixed(0)} km²` : "not in source"}`,
    `Region: ${orNa(p.region)}`,
    sourceLine("basins"),
  );
};
