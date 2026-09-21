import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Commodity } from "@/lib/scenarios/types";
import {
  SHALE_METRIC,
  shaleValue,
  type ShaleRegionCollection,
  type ShaleRegionData,
  type ShaleRegionProps,
} from "@/lib/data/shale-regions";
import { sourceLine } from "@/lib/data/sources";
import { SHALE_OUTLINE, SHALE_OUTLINE_MIN_PX, shaleRegionColor } from "@/lib/symbology";
import { joinLines, type TooltipFormatter } from "./tooltip";

export const SHALE_REGIONS_LAYER_ID = "shale_regions";

export interface ShaleRegionYearProps extends ShaleRegionProps {
  readonly year: number;
  /** kb/d in `year`; null when EIA has no value (before its series start). */
  readonly crude_kbpd: number | null;
  /** bcf/d in `year`. */
  readonly gas_bcfd: number | null;
  /** Latest historical year in the data, and its values — may be past the map's data year. */
  readonly latest_year: number;
  readonly latest_crude_kbpd: number | null;
  readonly latest_gas_bcfd: number | null;
  readonly first_year: number;
}

export type ShaleRegionFeature = Feature<Polygon | MultiPolygon, ShaleRegionYearProps>;
export type ShaleRegionYearCollection = FeatureCollection<Polygon | MultiPolygon, ShaleRegionYearProps>;

/** Attach the selected year's (and the latest year's) production to each region. */
export function shaleRegionFeatures(
  shapes: ShaleRegionCollection,
  data: ShaleRegionData,
  year: number,
): ShaleRegionYearCollection {
  const crude = SHALE_METRIC.oil;
  const gas = SHALE_METRIC.gas;
  return {
    type: "FeatureCollection",
    features: shapes.features.map((f): ShaleRegionFeature => {
      const id = f.properties.region_id;
      return {
        ...f,
        properties: {
          ...f.properties,
          year,
          crude_kbpd: shaleValue(data, id, crude, year),
          gas_bcfd: shaleValue(data, id, gas, year),
          latest_year: data.lastYear,
          latest_crude_kbpd: shaleValue(data, id, crude, data.lastYear),
          latest_gas_bcfd: shaleValue(data, id, gas, data.lastYear),
          first_year: data.firstYear,
        },
      };
    }),
  };
}

/**
 * Region polygons filled by the selected commodity's output in the active
 * year, against a fixed all-years maximum. Beneath the point and line layers:
 * a region is a backdrop for the wells and pipes inside it.
 */
export function buildShaleRegionsLayer(
  fc: ShaleRegionYearCollection,
  commodity: Commodity,
  max: number,
): GeoJsonLayer<ShaleRegionYearProps> {
  const pick = (p: ShaleRegionYearProps) => (commodity === "gas" ? p.gas_bcfd : p.crude_kbpd);
  return new GeoJsonLayer<ShaleRegionYearProps>({
    id: SHALE_REGIONS_LAYER_ID,
    data: fc,
    filled: true,
    stroked: true,
    getFillColor: (f) => [...shaleRegionColor(pick(f.properties), max, commodity)],
    getLineColor: [...SHALE_OUTLINE],
    lineWidthMinPixels: SHALE_OUTLINE_MIN_PX,
    pickable: true,
    updateTriggers: { getFillColor: [fc.features[0]?.properties.year, commodity, max] },
  });
}

const kbpd = (v: number) => `${Math.round(v).toLocaleString("en-US")} kb/d`;
const bcfd = (v: number) => `${v.toFixed(1)} bcf/d`;

export const formatShaleRegionTooltip: TooltipFormatter<ShaleRegionFeature> = (f) => {
  const p = f.properties;
  const has = p.crude_kbpd !== null || p.gas_bcfd !== null;
  return joinLines(
    `${p.name} region (EIA) · ${p.counties.toString()} counties`,
    has
      ? `${p.year.toString()}: crude ${p.crude_kbpd !== null ? kbpd(p.crude_kbpd) : "n/a"} · marketed gas ${
          p.gas_bcfd !== null ? bcfd(p.gas_bcfd) : "n/a"
        }`
      : `${p.year.toString()}: no EIA data — the regional series start in ${p.first_year.toString()}`,
    // The data can run a year past the map's data year; show it rather than hide it.
    p.latest_year !== p.year &&
      `${p.latest_year.toString()} (latest full year): crude ${
        p.latest_crude_kbpd !== null ? kbpd(p.latest_crude_kbpd) : "n/a"
      } · gas ${p.latest_gas_bcfd !== null ? bcfd(p.latest_gas_bcfd) : "n/a"}`,
    "Region = the counties EIA assigns to it, not a geological outline",
    sourceLine("shale_regions"),
  );
};
