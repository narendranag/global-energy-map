"use client";
import { useEffect, useState } from "react";
import { computeHormuzImpact, type ScenarioResult } from "@/lib/scenarios/engine";
import { query } from "@/lib/duckdb/query";

interface FlowRow extends Record<string, unknown> {
  year: number;
  importer_iso3: string;
  exporter_iso3: string;
  qty: number;
}
interface RouteRow extends Record<string, unknown> {
  chokepoint_id: string;
  exporter_iso3: string;
  share: number;
}

export function useHormuzScenario(year: number, enabled: boolean) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    void (async () => {
      if (!enabled) {
        // Async path so setState is never called synchronously in effect body
        await Promise.resolve();
        if (!ctrl.cancelled) setResult(null);
        return;
      }
      // CRITICAL: BACI has null qty for many rows. COALESCE here so the engine
      // (which sums row.qty directly) never sees NaN.
      const flows = await query<FlowRow>(
        `SELECT year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
         FROM read_parquet('/data/trade_flow.parquet')
         WHERE year = ? AND hs_code = '2709'`,
        [year],
      );
      const routes = await query<RouteRow>(
        `SELECT chokepoint_id, exporter_iso3, share FROM read_parquet('/data/chokepoint_route.parquet')`,
      );
      if (ctrl.cancelled) return;
      setResult(
        computeHormuzImpact({
          year,
          tradeFlows: flows.rows,
          routes: routes.rows,
        }),
      );
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [year, enabled]);
  return result;
}

export function hormuzOverlay(r: ScenarioResult | null) {
  if (!r) return undefined;
  const m = new Map<string, { color: readonly [number, number, number, number]; tooltip: string }>();
  for (const imp of r.byImporter) {
    const t = imp.shareAtRisk;
    // red intensity ∝ share at risk
    const red = Math.round(80 + 175 * t);
    m.set(imp.iso3, {
      color: [red, 30, 30, 220] as const,
      tooltip: `${imp.iso3}: ${(t * 100).toFixed(1)}% of crude imports at risk`,
    });
  }
  return m;
}
