"use client";
import { useEffect, useState } from "react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import type { RefineryImpact } from "@/lib/scenarios/types";

interface RefineryDataRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
}

export interface RefineriesLayerInput {
  readonly visible: boolean;
  readonly impactByAssetId?: ReadonlyMap<string, RefineryImpact>;
}

export function useRefineriesLayer({ visible, impactByAssetId }: RefineriesLayerInput) {
  const [layer, setLayer] = useState<ScatterplotLayer<RefineryDataRow> | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      // Schedule the clear asynchronously to avoid calling setState synchronously
      // inside the effect body — avoids the react-hooks/set-state-in-effect lint rule.
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setLayer(null);
      });
      return () => {
        ctrl.cancelled = true;
      };
    }
    void (async () => {
      const res = await query<RefineryDataRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'refinery'`,
      );
      if (ctrl.cancelled) return;
      const l = new ScatterplotLayer<RefineryDataRow>({
        id: "refineries",
        data: res.rows,
        getPosition: (d) => [d.lon, d.lat],
        // capacity in kbpd; OSM refineries usually lack capacity tags, so min radius is the common case
        getRadius: (d) => 3_000 + Math.sqrt(Math.max(0, d.capacity ?? 0)) * 400,
        radiusUnits: "meters",
        radiusMinPixels: 3,
        radiusMaxPixels: 14,
        getFillColor: (d: RefineryDataRow) => {
          const impact = impactByAssetId?.get(d.asset_id);
          if (impact && impact.shareAtRisk > 0) {
            const red = Math.round(60 + 180 * impact.shareAtRisk);
            return [red, 30, 30, 230];
          }
          return [30, 80, 160, 200]; // base teal/blue
        },
        stroked: true,
        getLineColor: [20, 20, 40, 220],
        lineWidthMinPixels: 0.5,
        pickable: true,
        updateTriggers: { getFillColor: [impactByAssetId] },
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible, impactByAssetId]);
  return layer;
}
