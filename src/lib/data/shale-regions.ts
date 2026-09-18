import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Commodity } from "@/lib/scenarios/types";
import { cachedLoader, fetchJson } from "./cache";
import { readParquet } from "./parquet";

/**
 * EIA STEO production for the five county-defined US shale regions
 * (build_shale_regions.py). Annual, history only: STEO's forecast years are
 * dropped at build time, so nothing here is a projection.
 */

export interface ShaleRegionProps extends Record<string, unknown> {
  readonly region_id: string;
  readonly name: string;
  /** Counties in EIA's definition of the region. */
  readonly counties: number;
}

export type ShaleRegionCollection = FeatureCollection<Polygon | MultiPolygon, ShaleRegionProps>;

export const SHALE_METRIC: Record<Commodity, string> = {
  oil: "crude_production_kbpd",
  gas: "gas_marketed_bcfd",
};

export interface ShaleRegionData {
  /** region_id → metric → year → value. */
  readonly values: ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<number, number>>>;
  readonly firstYear: number;
  readonly lastYear: number;
  /** Largest value per metric across every region and year: fixed ramp anchors, so a year change is visible. */
  readonly max: ReadonlyMap<string, number>;
}

interface Row {
  readonly region_id: string;
  readonly year: number;
  readonly metric: string;
  readonly value: number | null;
}

export function toShaleRegionData(rows: readonly Row[]): ShaleRegionData {
  const values = new Map<string, Map<string, Map<number, number>>>();
  const max = new Map<string, number>();
  let firstYear = Infinity;
  let lastYear = -Infinity;
  for (const r of rows) {
    if (r.value === null || !Number.isFinite(r.value)) continue;
    let byMetric = values.get(r.region_id);
    if (!byMetric) values.set(r.region_id, (byMetric = new Map<string, Map<number, number>>()));
    let byYear = byMetric.get(r.metric);
    if (!byYear) byMetric.set(r.metric, (byYear = new Map<number, number>()));
    byYear.set(r.year, r.value);
    max.set(r.metric, Math.max(max.get(r.metric) ?? 0, r.value));
    firstYear = Math.min(firstYear, r.year);
    lastYear = Math.max(lastYear, r.year);
  }
  return { values, firstYear, lastYear, max };
}

export function shaleValue(
  data: ShaleRegionData,
  regionId: string,
  metric: string,
  year: number,
): number | null {
  return data.values.get(regionId)?.get(metric)?.get(year) ?? null;
}

export const loadShaleRegionData = cachedLoader(async (): Promise<ShaleRegionData> => {
  const rows = await readParquet<Row>("/data/shale_region_year.parquet", [
    "region_id",
    "year",
    "metric",
    "value",
  ]);
  return toShaleRegionData(rows);
});

export const loadShaleRegionShapes = cachedLoader(() =>
  fetchJson<ShaleRegionCollection>("/data/shale_regions.geojson"),
);
