"use client";
import { useEffect, useState } from "react";
import { GeoJsonLayer } from "@deck.gl/layers";
import { loadCountries, type CountryProps } from "@/lib/geo/countries";
import { query } from "@/lib/duckdb/query";
import type { Commodity } from "@/lib/scenarios/types";

interface ReservesRow extends Record<string, unknown> {
  iso3: string;
  value: number;
}

export interface OverlayEntry {
  readonly color: readonly [number, number, number, number];
  readonly tooltip?: string;
}

export interface ReservesChoroplethInput {
  readonly year: number;
  readonly commodity: Commodity;
  readonly overlayByIso3?: ReadonlyMap<string, OverlayEntry>;
}

function colorRamp(t: number): [number, number, number, number] {
  const t01 = Math.max(0, Math.min(1, t));
  const r = Math.round(230 - 200 * t01);
  const g = Math.round(230 - 80 * t01);
  const b = Math.round(230 - 50 * t01);
  return [r, g, b, 200];
}

export function useReservesChoropleth({ year, commodity, overlayByIso3 }: ReservesChoroplethInput) {
  const [layer, setLayer] = useState<GeoJsonLayer | null>(null);
  useEffect(() => {
    const metric =
      commodity === "oil" ? "proved_reserves_oil_bbn_bbl" : "proved_reserves_gas_tcm";
    const ctrl = { cancelled: false };
    void (async () => {
      const countries = await loadCountries();
      const res = await query<ReservesRow>(
        `SELECT iso3, value FROM read_parquet('/data/country_year_series.parquet')
         WHERE metric = ? AND year = ?`,
        [metric, year],
      );
      if (ctrl.cancelled) return;
      const byIso = new Map(res.rows.map((r) => [r.iso3, r.value]));
      const maxVal = Math.max(0, ...res.rows.map((r) => r.value));
      const styled = new GeoJsonLayer<CountryProps>({
        id: `reserves-${commodity}-${String(year)}-${overlayByIso3 ? "ovl" : "base"}`,
        data: countries,
        filled: true,
        stroked: true,
        getFillColor: (f) => {
          const iso = f.properties.iso3;
          const override = overlayByIso3?.get(iso);
          if (override) return [...override.color] as [number, number, number, number];
          const v = byIso.get(iso) ?? 0;
          return colorRamp(maxVal > 0 ? v / maxVal : 0);
        },
        getLineColor: [120, 120, 120, 180],
        lineWidthMinPixels: 0.5,
        pickable: true,
        updateTriggers: { getFillColor: [year, commodity, overlayByIso3] },
      });
      setLayer(styled);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [year, commodity, overlayByIso3]);
  return layer;
}
