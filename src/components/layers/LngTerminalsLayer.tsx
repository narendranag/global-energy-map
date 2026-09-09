"use client";
import { useEffect, useState } from "react";
import { IconLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";
import { isVisibleAtYear } from "@/lib/vintage/filter";
import type { LngImportImpact } from "@/lib/scenarios/types";

interface LngTerminalRow extends Record<string, unknown> {
  asset_id: string;
  kind: "lng_export" | "lng_import";
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
  commissioned_year: number | null;
  unit_count: number | null;
  total_processed_bcm: number | null;
  un_locode: string | null;
  source: string | null;
}

export interface LngTerminalsLayerInput {
  readonly visible: boolean;
  readonly year: number;
  readonly impactByAssetId?: ReadonlyMap<string, LngImportImpact>;
}

// Inline SVG icons rendered to dataURI so we don't ship sprite assets.
// Filled triangle (export) and hollow triangle (import).
const ICON_ATLAS =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 64 32">
  <polygon points="16,4 28,28 4,28" fill="white"/>
  <polygon points="48,4 60,28 36,28" fill="none" stroke="white" stroke-width="3"/>
</svg>
`);

const ICON_MAPPING = {
  lng_export: { x: 0, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 28, mask: true },
  lng_import: { x: 32, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 28, mask: true },
} as const;

export function useLngTerminalsLayer({ visible, year, impactByAssetId }: LngTerminalsLayerInput) {
  const [layer, setLayer] = useState<IconLayer<LngTerminalRow> | null>(null);
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
      const res = await query<LngTerminalRow>(
        `SELECT asset_id, kind, name, country_iso3, lon, lat, capacity, operator, status,
                CAST(commissioned_year AS INTEGER) AS commissioned_year,
                CAST(unit_count AS INTEGER) AS unit_count,
                CAST(total_processed_bcm AS DOUBLE) AS total_processed_bcm,
                un_locode, source
         FROM read_parquet('/data/assets.parquet')
         WHERE kind IN ('lng_export', 'lng_import')`,
      );
      if (ctrl.cancelled) return;
      const filtered = (res.rows as LngTerminalRow[]).filter((r) =>
        isVisibleAtYear(r.commissioned_year, year),
      );
      const l = new IconLayer<LngTerminalRow>({
        id: "lng-terminals",
        data: filtered,
        iconAtlas: ICON_ATLAS,
        iconMapping: ICON_MAPPING,
        getIcon: (d) => d.kind,
        getPosition: (d) => [d.lon, d.lat],
        // Capacity in mtpa; scale similar to refineries (sqrt for area perception)
        getSize: (d) => 14 + Math.sqrt(Math.max(0, d.capacity ?? 0)) * 2.2,
        sizeUnits: "pixels",
        sizeMinPixels: 10,
        sizeMaxPixels: 36,
        getColor: (d) => {
          const impact = impactByAssetId?.get(d.asset_id);
          if (impact?.coverage === "none") {
            // No measured voyages to this terminal under the active scenario's
            // year — a data gap, not a real "safe" reading. Render neutral grey
            // rather than the base teal (which would look like "no exposure").
            return [140, 140, 140, 200];
          }
          if (impact && impact.shareAtRisk > 0) {
            const red = Math.round(80 + 175 * impact.shareAtRisk);
            return [red, 30, 30, 230];
          }
          // Base: cyan/teal to contrast with oil's warm palette
          return [20, 130, 160, 230];
        },
        pickable: true,
        updateTriggers: { getColor: [impactByAssetId] },
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible, year, impactByAssetId]);
  return layer;
}
