"use client";
import { useEffect, useState } from "react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import { isVisibleAtYear } from "@/lib/vintage/filter";

interface AssetRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
  commissioned_year: number | null;
}

export interface ExtractionPointsInput {
  readonly year: number;
}

export function useExtractionPoints({ year }: ExtractionPointsInput) {
  const [layer, setLayer] = useState<ScatterplotLayer<AssetRow> | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    void (async () => {
      const res = await query<AssetRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status,
                commissioned_year
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'extraction_site'`,
      );
      if (ctrl.cancelled) return;
      const filtered = (res.rows as AssetRow[]).filter((r) =>
        isVisibleAtYear(r.commissioned_year, year),
      );
      const l = new ScatterplotLayer<AssetRow>({
        id: "extraction",
        data: filtered,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => 2_500 + Math.sqrt(Math.max(0, d.capacity ?? 0)) * 1_500,
        radiusUnits: "meters",
        radiusMinPixels: 1.5,
        radiusMaxPixels: 8,
        getFillColor: [220, 60, 40, 180],
        stroked: true,
        getLineColor: [40, 20, 10, 220],
        lineWidthMinPixels: 0.5,
        pickable: true,
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [year]);
  return layer;
}
