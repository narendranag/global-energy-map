import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { CountryCollection, CountryProps } from "@/lib/geo/countries";
import {
  divergesFromBaci,
  isComplete,
  RECENT_IMPORTS_WINDOW,
  type RecentImport,
  type RecentImportsData,
} from "@/lib/data/recent-imports";
import { sourceLine } from "@/lib/data/sources";
import type { Commodity } from "@/lib/scenarios/types";
import { COUNTRY_OUTLINE_COLOR, COUNTRY_OUTLINE_MIN_PX, recentImportsColor } from "@/lib/symbology";
import { joinLines, type TooltipFormatter } from "./tooltip";

export const RECENT_IMPORTS_LAYER_ID = "recent_imports";

export interface RecentImportsProps extends CountryProps {
  readonly commodity: Commodity;
  /** null = no monthly Comtrade reports for this commodity. */
  readonly recent: RecentImport | null;
  readonly baci_year: number;
}

export type RecentImportsFeature = Feature<Polygon | MultiPolygon, RecentImportsProps>;
export type RecentImportsCollection = FeatureCollection<Polygon | MultiPolygon, RecentImportsProps>;

export function recentImportsFeatures(
  countries: CountryCollection,
  data: RecentImportsData,
): RecentImportsCollection {
  return {
    type: "FeatureCollection",
    features: countries.features.map(
      (f): RecentImportsFeature => ({
        ...f,
        properties: {
          ...f.properties,
          commodity: data.commodity,
          recent: data.byIso3.get(f.properties.iso3) ?? null,
          baci_year: data.baciYear,
        },
      }),
    ),
  };
}

/**
 * Latest-12-months imports choropleth. Not year-filtered: like gas storage, it
 * shows the most recent data regardless of the slider, and its tooltip says so.
 */
export function buildRecentImportsLayer(
  fc: RecentImportsCollection,
  max: number,
): GeoJsonLayer<RecentImportsProps> {
  return new GeoJsonLayer<RecentImportsProps>({
    id: RECENT_IMPORTS_LAYER_ID,
    data: fc,
    filled: true,
    stroked: true,
    getFillColor: (f) => {
      const r = f.properties.recent;
      return [...recentImportsColor(r === null ? null : r.mt, max, f.properties.commodity, r !== null && isComplete(r))];
    },
    getLineColor: [...COUNTRY_OUTLINE_COLOR],
    lineWidthMinPixels: COUNTRY_OUTLINE_MIN_PX,
    pickable: true,
    updateTriggers: { getFillColor: [fc.features[0]?.properties.commodity, max] },
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-05" → "May 2026". */
export function formatMonth(ym: string): string {
  return `${MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym.slice(5, 7)} ${ym.slice(0, 4)}`;
}

function mt(v: number): string {
  return v >= 10 ? `${v.toFixed(0)} Mt` : v >= 1 ? `${v.toFixed(1)} Mt` : `${(v * 1000).toFixed(0)} kt`;
}

export const formatRecentImportsTooltip: TooltipFormatter<RecentImportsFeature> = (f, ctx) => {
  const p = f.properties;
  const r = p.recent;
  const what = p.commodity === "gas" ? "LNG imports" : "Crude imports";
  if (r === null) {
    return joinLines(
      `${p.name} (${p.iso3})`,
      `${what}: no monthly reports to UN Comtrade`,
      sourceLine("trade_monthly"),
    );
  }
  return joinLines(
    `${p.name} (${p.iso3})`,
    `${what}, ${formatMonth(r.from)} – ${formatMonth(r.through)}: ${mt(r.mt)}`,
    !isComplete(r) &&
      `Only ${r.monthsReported.toString()} of ${RECENT_IMPORTS_WINDOW.toString()} months reported — a partial total, drawn as incomplete`,
    r.baciMt !== null ? `BACI ${p.baci_year.toString()} (reconciled, annual): ${mt(r.baciMt)}` : `BACI ${p.baci_year.toString()}: none recorded`,
    divergesFromBaci(r) && "More than 2× off BACI — likely a reporting or unit error; check before citing",
    "As reported by the importer, not reconciled; a different measurement from BACI",
    `Latest reported months — not affected by the year slider (${ctx.year.toString()})`,
    sourceLine("trade_monthly"),
  );
};
