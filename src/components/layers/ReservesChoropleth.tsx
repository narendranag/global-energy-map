import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { CountryCollection, CountryProps } from "@/lib/geo/countries";
import type { ReservesData } from "@/lib/data/reserves";
import { sourceLine } from "@/lib/data/sources";
import { RESERVES_LATEST_YEAR } from "@/lib/time/range";
import type { Commodity } from "@/lib/scenarios/types";
import { importsNoun, type OverlayEntry } from "@/components/scenarios/overlay";
import {
  COUNTRY_OUTLINE_COLOR,
  COUNTRY_OUTLINE_MIN_PX,
  reservesColor,
} from "@/lib/symbology";
import { joinLines, type TooltipFormatter } from "./tooltip";

export const RESERVES_LAYER_ID = "reserves";

/** Country feature properties with the reserves reading attached for tooltips. */
export interface ReservesProps extends CountryProps {
  /** null = no reserves row in the source for this country/year. */
  readonly value: number | null;
  readonly commodity: Commodity;
  /** Year the value is from (≤ RESERVES_LATEST_YEAR). */
  readonly data_year: number;
}

export type ReservesFeature = Feature<Polygon | MultiPolygon, ReservesProps>;
export type ReservesCollection = FeatureCollection<Polygon | MultiPolygon, ReservesProps>;

/** Attach each country's reserves reading (or null) to its polygon. */
export function reservesFeatures(
  countries: CountryCollection,
  data: ReservesData,
): ReservesCollection {
  return {
    type: "FeatureCollection",
    features: countries.features.map(
      (f): ReservesFeature => ({
        ...f,
        properties: {
          ...f.properties,
          value: data.values.get(f.properties.iso3) ?? null,
          commodity: data.commodity,
          data_year: data.dataYear,
        },
      }),
    ),
  };
}

/**
 * Reserves choropleth (log ramp) with the scenario exposure overlay painted
 * over importers. The id is stable: year/commodity changes swap `data`, a
 * scenario change trips `updateTriggers`, and the layer is never rebuilt (R17).
 */
export function buildReservesLayer(
  fc: ReservesCollection,
  max: number,
  overlayByIso3?: ReadonlyMap<string, OverlayEntry>,
): GeoJsonLayer<ReservesProps> {
  return new GeoJsonLayer<ReservesProps>({
    id: RESERVES_LAYER_ID,
    data: fc,
    filled: true,
    stroked: true,
    getFillColor: (f) => {
      const override = overlayByIso3?.get(f.properties.iso3)?.color;
      return [...(override ?? reservesColor(f.properties.value, max))];
    },
    getLineColor: [...COUNTRY_OUTLINE_COLOR],
    lineWidthMinPixels: COUNTRY_OUTLINE_MIN_PX,
    pickable: true,
    updateTriggers: { getFillColor: [max, overlayByIso3] },
  });
}

/** Tooltip value string, e.g. "297.5 bn bbl" or "6.02 tcm". */
export function formatReserves(value: number, commodity: Commodity): string {
  const digits = value >= 10 ? 1 : value >= 1 ? 2 : 3;
  return `${value.toFixed(digits)} ${commodity === "oil" ? "bn bbl" : "tcm"}`;
}

export const formatReservesTooltip: TooltipFormatter<ReservesFeature> = (f, ctx) => {
  const p = f.properties;
  const c = p.commodity;
  const dataYear = p.data_year.toString();
  const scenarioLine =
    ctx.scenario === null
      ? null
      : (ctx.overlay?.get(p.iso3)?.tooltip ??
        `Scenario: no ${ctx.scenario.year.toString()} ${importsNoun(ctx.commodity)} recorded in BACI`);
  return joinLines(
    `${p.name} (${p.iso3})`,
    p.value !== null
      ? `Proved ${c} reserves: ${formatReserves(p.value, c)} (${dataYear})`
      : `Proved ${c} reserves: no data in source (${dataYear})`,
    ctx.year > RESERVES_LATEST_YEAR &&
      `(latest in source; year selected: ${ctx.year.toString()})`,
    sourceLine("reserves"),
    scenarioLine !== null && "",
    scenarioLine,
    scenarioLine !== null && sourceLine("trade"),
  );
};
