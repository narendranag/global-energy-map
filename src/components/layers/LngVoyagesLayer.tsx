"use client";
import { useEffect, useMemo, useState } from "react";
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
  const [rows, setRows] = useState<readonly VoyageRow[]>([]);

  // Query only depends on what changes the underlying row set — scenario
  // recoloring (impactByTerminalName) must not re-run the 17.6k-row join.
  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setRows([]);
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
            -- One row per terminal name: assets.parquet can hold the same
            -- name twice (e.g. an export and an import berth at one site),
            -- and an un-grouped join would fan out into duplicate arcs.
            -- When a name has two rows, prefer LNG-T3's coordinates over a
            -- supplement source (arbitrary any_value() could otherwise pick
            -- either one nondeterministically).
            SELECT
              name,
              arg_min(lon, CASE WHEN source LIKE '%LNG-T3%' THEN 0 ELSE 1 END) AS lon,
              arg_min(lat, CASE WHEN source LIKE '%LNG-T3%' THEN 0 ELSE 1 END) AS lat
            FROM read_parquet('/data/assets.parquet')
            WHERE kind IN ('lng_export', 'lng_import')
            GROUP BY name
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
        setRows(res.rows);
      } catch (err) {
        console.error("LngVoyagesLayer load failed:", err);
      }
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible, year, minConfidence]);

  // Recolouring on scenario change only needs to rebuild the layer object,
  // not re-run the DuckDB join above.
  const layer = useMemo(() => {
    if (rows.length === 0) return null;
    return new ArcLayer<VoyageRow>({
      id: "lng-voyages",
      data: rows,
      getSourcePosition: (d) => [d.from_lon, d.from_lat],
      getTargetPosition: (d) => [d.to_lon, d.to_lat],
      getSourceColor: (d) => {
        // Export end — orange-ish. Tinted toward red when the *destination*
        // terminal (d.to_terminal) is exposed under the active scenario, so
        // both ends of an at-risk cargo read as at-risk.
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
      // `data` (rows) is unchanged on a scenario switch, and deck.gl does not
      // re-run accessors just because their closures are new — the trigger
      // is what forces the colour attributes to recompute.
      updateTriggers: {
        getSourceColor: [impactByTerminalName],
        getTargetColor: [impactByTerminalName],
      },
    });
  }, [rows, impactByTerminalName]);

  return layer;
}
