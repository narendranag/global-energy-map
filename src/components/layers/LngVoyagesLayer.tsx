"use client";
import { useEffect, useState } from "react";
import { ArcLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import type { LngImportImpact } from "@/lib/scenarios/types";

interface VoyageRow extends Record<string, unknown> {
  voyage_id: string;
  start_date: string;
  end_date: string;
  imo: number;
  voyage_type: "export" | "return";
  from_terminal: string;
  to_terminal: string;
  from_country: string;
  to_country: string;
  from_country_iso3: string;
  to_country_iso3: string;
  amount_cbm: number;
  confidence_score: number;
  from_lon: number;
  from_lat: number;
  to_lon: number;
  to_lat: number;
}

export interface LngVoyagesLayerInput {
  readonly visible: boolean;
  readonly year: number;
  readonly minConfidence?: number;
  readonly impactByTerminalName?: ReadonlyMap<string, LngImportImpact>;
}

export function useLngVoyagesLayer({
  visible,
  year,
  minConfidence = 3,
  impactByTerminalName,
}: LngVoyagesLayerInput) {
  const [layer, setLayer] = useState<ArcLayer<VoyageRow> | null>(null);

  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setLayer(null);
      });
      return () => {
        ctrl.cancelled = true;
      };
    }
    void (async () => {
      try {
        // Join voyages to asset coordinates via terminal name.
        // Date range: any voyage active during the selected year
        // (start_date.year <= year <= end_date.year).
        const sql = `
          WITH terms AS (
            SELECT name, lon, lat
            FROM read_parquet('/data/assets.parquet')
            WHERE kind IN ('lng_export', 'lng_import')
          )
          SELECT
            v.voyage_id,
            CAST(v.start_date AS VARCHAR) AS start_date,
            CAST(v.end_date AS VARCHAR) AS end_date,
            CAST(v.imo AS INTEGER) AS imo, v.voyage_type,
            v.from_terminal, v.to_terminal,
            v.from_country, v.to_country,
            v.from_country_iso3, v.to_country_iso3,
            CAST(v.amount_cbm AS DOUBLE) AS amount_cbm,
            CAST(v.confidence_score AS INTEGER) AS confidence_score,
            ft.lon AS from_lon, ft.lat AS from_lat,
            tt.lon AS to_lon, tt.lat AS to_lat
          FROM read_parquet('/data/lng_voyage.parquet') v
          LEFT JOIN terms ft ON v.from_terminal = ft.name
          LEFT JOIN terms tt ON v.to_terminal = tt.name
          WHERE v.voyage_type = 'export'
            AND v.confidence_score >= ${minConfidence.toString()}
            AND year(v.start_date) <= ${year.toString()}
            AND year(v.end_date) >= ${year.toString()}
            AND ft.lon IS NOT NULL AND tt.lon IS NOT NULL
        `;
        const res = await query<VoyageRow>(sql);
        if (ctrl.cancelled) return;

        const l = new ArcLayer<VoyageRow>({
          id: "lng-voyages",
          data: res.rows,
          getSourcePosition: (d) => [d.from_lon, d.from_lat],
          getTargetPosition: (d) => [d.to_lon, d.to_lat],
          getSourceColor: (d) => {
            // Export end — orange-ish. Tint toward red for at-risk exporters.
            const impact = impactByTerminalName?.get(d.to_terminal);
            if (impact && impact.shareAtRisk > 0) {
              return [220, 80, 60, 200];
            }
            return [220, 140, 60, 160];
          },
          getTargetColor: (d) => {
            // Import end — teal/blue. Tint toward red when at-risk.
            const impact = impactByTerminalName?.get(d.to_terminal);
            if (impact && impact.shareAtRisk > 0) {
              const r = Math.round(80 + 175 * impact.shareAtRisk);
              return [r, 30, 30, 230];
            }
            return [20, 140, 200, 200];
          },
          getWidth: (d) =>
            Math.max(0.5, Math.log10(Math.max(1, d.amount_cbm)) - 3),
          widthMinPixels: 0.5,
          widthMaxPixels: 4,
          greatCircle: true,
          pickable: true,
          updateTriggers: {
            getSourceColor: [impactByTerminalName],
            getTargetColor: [impactByTerminalName],
          },
        });
        setLayer(l);
      } catch (err) {
        console.error("LngVoyagesLayer load failed:", err);
      }
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible, year, minConfidence, impactByTerminalName]);

  return layer;
}
