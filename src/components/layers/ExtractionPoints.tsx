import { ScatterplotLayer } from "@deck.gl/layers";
import type { ExtractionAsset } from "@/lib/data/assets";
import { sourceLine } from "@/lib/data/sources";
import { isVisibleAtYear } from "@/lib/vintage/filter";
import {
  EXTRACTION_FILL,
  EXTRACTION_LINE,
  EXTRACTION_RADIUS,
  extractionRadius,
} from "@/lib/symbology";
import { formatCapacity, joinLines, orNa, type TooltipFormatter } from "./tooltip";

export const EXTRACTION_LAYER_ID = "extraction";

/** Extraction sites commissioned by `year` (undated sites always show). */
export function buildExtractionLayer(
  rows: readonly ExtractionAsset[],
  year: number,
): ScatterplotLayer<ExtractionAsset> {
  return new ScatterplotLayer<ExtractionAsset>({
    id: EXTRACTION_LAYER_ID,
    data: rows.filter((r) => isVisibleAtYear(r.commissioned_year, year)),
    getPosition: (d) => [d.lon, d.lat],
    getRadius: (d) => extractionRadius(d.capacity),
    radiusUnits: "meters",
    radiusMinPixels: EXTRACTION_RADIUS.minPixels,
    radiusMaxPixels: EXTRACTION_RADIUS.maxPixels,
    getFillColor: [...EXTRACTION_FILL],
    stroked: true,
    getLineColor: [...EXTRACTION_LINE],
    lineWidthMinPixels: 0.5,
    pickable: true,
  });
}

export const formatExtractionTooltip: TooltipFormatter<ExtractionAsset> = (o) =>
  joinLines(
    `Extraction site: ${o.name}`,
    `Country: ${o.country_iso3}`,
    `Operator: ${orNa(o.operator)}`,
    `Status: ${orNa(o.status)}`,
    `Capacity: ${formatCapacity(o.capacity, o.capacity_unit ?? "kboe/d", 1)}`,
    o.commissioned_year !== null && `Start year: ${o.commissioned_year.toString()}`,
    sourceLine("extraction", o.source),
  );
