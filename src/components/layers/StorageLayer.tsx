import { ScatterplotLayer } from "@deck.gl/layers";
import type { StorageAsset } from "@/lib/data/assets";
import { sourceLine } from "@/lib/data/sources";
import { STORAGE_FILL, STORAGE_LINE, STORAGE_RADIUS } from "@/lib/symbology";
import { formatCapacity, joinLines, orNa, type TooltipFormatter } from "./tooltip";

export const STORAGE_LAYER_ID = "storage";

/**
 * Storage hubs — fixed radius (capacity is known for a handful of rows).
 * `visible: false` below the layer's minimum zoom (26 k dots smudge coastlines).
 */
export function buildStorageLayer(
  rows: readonly StorageAsset[],
  { scale = 1, visible = true }: { readonly scale?: number; readonly visible?: boolean } = {},
): ScatterplotLayer<StorageAsset> {
  return new ScatterplotLayer<StorageAsset>({
    id: STORAGE_LAYER_ID,
    data: rows,
    getPosition: (d) => [d.lon, d.lat],
    getRadius: STORAGE_RADIUS.metres,
    radiusUnits: "meters",
    radiusMinPixels: STORAGE_RADIUS.minPixels * scale,
    radiusMaxPixels: STORAGE_RADIUS.maxPixels * scale,
    getFillColor: [...STORAGE_FILL],
    stroked: true,
    getLineColor: [...STORAGE_LINE],
    lineWidthMinPixels: 0.5,
    visible,
    pickable: true,
  });
}

export const formatStorageTooltip: TooltipFormatter<StorageAsset> = (o) =>
  joinLines(
    `Storage: ${o.name}`,
    `Country: ${o.country_iso3}`,
    `Operator: ${orNa(o.operator)}`,
    `Status: ${orNa(o.status)}`,
    `Capacity: ${formatCapacity(o.capacity, o.capacity_unit ?? "bbl")}`,
    sourceLine("storage", o.source),
  );
