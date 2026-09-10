"use client";
import { useEffect, useMemo, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { loadCountries, type CountryProps } from "@/lib/geo/countries";
import { query } from "@/lib/duckdb/query";
import { reservesDataYear } from "@/lib/time/range";
import type { Commodity } from "@/lib/scenarios/types";
import type { OverlayEntry } from "@/components/scenarios/overlay";
import { reservesColor } from "./reservesRamp";

interface ReservesRow extends Record<string, unknown> {
  iso3: string;
  value: number;
}

/** Country feature properties with the reserves reading attached for tooltips. */
export interface ReservesProps extends CountryProps {
  /** null = no reserves row in the source for this country/year. */
  readonly value: number | null;
  readonly commodity: Commodity;
  /** Year the value is from (≤ RESERVES_LATEST_YEAR). */
  readonly data_year: number;
}

type ReservesCollection = FeatureCollection<Polygon | MultiPolygon, ReservesProps>;

export type { OverlayEntry };

export interface ReservesChoroplethInput {
  readonly year: number;
  readonly commodity: Commodity;
  readonly overlayByIso3?: ReadonlyMap<string, OverlayEntry>;
}

/**
 * Reserves choropleth. EI stopped publishing proved reserves after
 * RESERVES_LATEST_YEAR, so a later selected year shows the latest value.
 *
 * The layer id is stable ("reserves"): year/commodity/scenario changes update
 * `data` or trip `updateTriggers` instead of rebuilding the layer.
 */
export function useReservesChoropleth({ year, commodity, overlayByIso3 }: ReservesChoroplethInput) {
  const dataYear = reservesDataYear(year);
  const [data, setData] = useState<{ fc: ReservesCollection; max: number } | null>(null);

  useEffect(() => {
    const metric =
      commodity === "oil" ? "proved_reserves_oil_bbn_bbl" : "proved_reserves_gas_tcm";
    const ctrl = { cancelled: false };
    void (async () => {
      try {
        const countries = await loadCountries();
        const res = await query<ReservesRow>(
          `SELECT iso3, value FROM read_parquet('/data/country_year_series.parquet')
           WHERE metric = ? AND year = ?`,
          [metric, dataYear],
        );
        if (ctrl.cancelled) return;
        const byIso = new Map(res.rows.map((r) => [r.iso3, r.value]));
        const max = Math.max(0, ...res.rows.map((r) => r.value));
        const features = countries.features.map(
          (f): Feature<Polygon | MultiPolygon, ReservesProps> => ({
            ...f,
            properties: {
              ...f.properties,
              value: byIso.get(f.properties.iso3) ?? null,
              commodity,
              data_year: dataYear,
            },
          }),
        );
        setData({ fc: { type: "FeatureCollection", features }, max });
      } catch (err) {
        console.error("ReservesChoropleth load failed:", err);
      }
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [dataYear, commodity]);

  return useMemo(() => {
    if (!data) return null;
    const { fc, max } = data;
    return new GeoJsonLayer<ReservesProps>({
      id: "reserves",
      data: fc,
      filled: true,
      stroked: true,
      getFillColor: (f) => {
        const override = overlayByIso3?.get(f.properties.iso3)?.color;
        if (override) return [...override];
        return [...reservesColor(f.properties.value, max)];
      },
      getLineColor: [120, 120, 120, 180],
      lineWidthMinPixels: 0.5,
      pickable: true,
      updateTriggers: { getFillColor: [fc, max, overlayByIso3] },
    });
  }, [data, overlayByIso3]);
}
