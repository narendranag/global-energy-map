"use client";
import { useEffect, useState } from "react";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import { query } from "@/lib/duckdb/query";

interface FlowRow extends Record<string, unknown> {
  year: number;
  importer_iso3: string;
  exporter_iso3: string;
  qty: number;
}
interface RouteRow extends Record<string, unknown> {
  disruption_id: ScenarioId;
  kind: "chokepoint" | "pipeline";
  exporter_iso3: string;
  importer_iso3: string | null;
  share: number;
}
interface RefRow extends Record<string, unknown> {
  asset_id: string;
  country_iso3: string;
  capacity: number;
}

export function useScenario(scenarioId: ScenarioId | null, year: number) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  useEffect(() => {
    if (scenarioId === null) {
      void Promise.resolve().then(() => {
        setResult(null);
      });
      return;
    }
    const ctrl = { cancelled: false };
    void (async () => {
      const flows = await query<FlowRow>(
        `SELECT CAST(year AS INTEGER) AS year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
         FROM read_parquet('/data/trade_flow.parquet')
         WHERE year = ? AND hs_code = '2709'`,
        [year],
      );
      const routes = await query<RouteRow>(
        `SELECT disruption_id, kind, exporter_iso3, importer_iso3, share
         FROM read_parquet('/data/disruption_route.parquet')
         WHERE disruption_id = ?`,
        [scenarioId],
      );
      const refineries = await query<RefRow>(
        `SELECT asset_id, country_iso3, COALESCE(capacity, 0) AS capacity
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'refinery'`,
      );
      if (ctrl.cancelled) return;
      setResult(
        computeScenarioImpact({
          scenarioId,
          year,
          tradeFlows: flows.rows,
          routes: routes.rows,
          refineries: refineries.rows,
        }),
      );
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [scenarioId, year]);
  return result;
}
