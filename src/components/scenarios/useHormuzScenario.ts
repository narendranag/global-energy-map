"use client";
import { useEffect, useState } from "react";
import { computeHormuzImpact } from "@/lib/scenarios/hormuz";
import type { ScenarioResult, DisruptionRouteRow, TradeFlowRow } from "@/lib/scenarios/types";
import { query } from "@/lib/duckdb/query";

// DuckDB-WASM query rows are Record<string,unknown> at runtime; we cast after fetching.
type RawRow = Record<string, unknown>;

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
      const flows = await query<RawRow>(
        `SELECT CAST(year AS INTEGER) AS year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
         FROM read_parquet('/data/trade_flow.parquet')
         WHERE year = ? AND hs_code = '2709'`,
        [year],
      );
      const routes = await query<RawRow>(
        `SELECT disruption_id, kind, exporter_iso3, importer_iso3, share FROM read_parquet('/data/disruption_route.parquet') WHERE disruption_id = 'hormuz'`,
      );
      if (ctrl.cancelled) return;
      const impact = computeHormuzImpact({
        year,
        tradeFlows: flows.rows as unknown as readonly TradeFlowRow[],
        routes: routes.rows as unknown as readonly DisruptionRouteRow[],
      });
      setResult(impact);
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
