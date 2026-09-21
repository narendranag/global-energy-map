import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { CountryCollection, CountryProps } from "@/lib/geo/countries";
import { dataIso3 } from "@/lib/geo/iso3";
import type { GasStorageData } from "@/lib/data/gas-storage";
import { sourceVintageLine } from "@/lib/data/section-vintage";
import {
  COUNTRY_OUTLINE_COLOR,
  COUNTRY_OUTLINE_MIN_PX,
  gasStorageColor,
} from "@/lib/symbology";
import { joinLines, type TooltipFormatter } from "./tooltip";

export const GAS_STORAGE_LAYER_ID = "gas_storage";

export interface GasStorageProps extends CountryProps {
  /** null = GIE does not report this country (most of the world). */
  readonly full_pct: number | null;
  /** Gas day the reading is from, ISO date. */
  readonly gas_day: string;
}

export type GasStorageFeature = Feature<Polygon | MultiPolygon, GasStorageProps>;
export type GasStorageCollection = FeatureCollection<Polygon | MultiPolygon, GasStorageProps>;

/**
 * Attach each country's fullness reading to its polygon.
 *
 * Countries GIE does not cover keep a null and render as no-data grey rather
 * than being dropped: a hole in the map would read as "0 % full" to anyone
 * glancing at it, which is a different and false claim.
 */
export function gasStorageFeatures(
  countries: CountryCollection,
  data: GasStorageData,
): GasStorageCollection {
  return {
    type: "FeatureCollection",
    features: countries.features.map(
      (f): GasStorageFeature => ({
        ...f,
        properties: {
          ...f.properties,
          full_pct: data.values.get(dataIso3(f.properties.iso3)) ?? null,
          gas_day: data.gasDay,
        },
      }),
    ),
  };
}

/**
 * Gas storage fullness choropleth, always showing GIE's latest gas day.
 *
 * Not year-filtered by design — see `GasStorageData`. `updateTriggers` keys on
 * the gas day so a refreshed build repaints.
 */
export function buildGasStorageLayer(fc: GasStorageCollection): GeoJsonLayer<GasStorageProps> {
  return new GeoJsonLayer<GasStorageProps>({
    id: GAS_STORAGE_LAYER_ID,
    data: fc,
    filled: true,
    stroked: true,
    getFillColor: (f) => [...gasStorageColor(f.properties.full_pct)],
    getLineColor: [...COUNTRY_OUTLINE_COLOR],
    lineWidthMinPixels: COUNTRY_OUTLINE_MIN_PX,
    pickable: true,
    updateTriggers: { getFillColor: [fc.features[0]?.properties.gas_day] },
  });
}

/** "78.5 % full" — one decimal is all the precision GIE's own figures carry. */
export function formatFullness(pct: number): string {
  return `${pct.toFixed(1)} % full`;
}

/** e.g. "17 Sep 2026" from an ISO date, without pulling in a date library. */
export function formatGasDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const formatGasStorageTooltip: TooltipFormatter<GasStorageFeature> = (f, ctx) => {
  const p = f.properties;
  return joinLines(
    `${p.name} (${p.iso3})`,
    p.full_pct !== null
      ? `Gas storage: ${formatFullness(p.full_pct)}`
      : "Gas storage: not reported to GIE",
    p.full_pct !== null && p.full_pct > 100
      ? "Above 100 %: more gas in store than nominal working volume"
      : false,
    p.full_pct !== null && `Gas day: ${formatGasDay(p.gas_day)}`,
    // Said explicitly because this layer ignores the year everything else reads at.
    p.full_pct !== null &&
      `Live reading — independent of the map’s data year (${ctx.year.toString()})`,
    sourceVintageLine("gas_storage"),
  );
};
