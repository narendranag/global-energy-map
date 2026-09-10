"use client";
import { useEffect, useState } from "react";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type {
  Commodity,
  LngVoyageRow,
  RefineryImpact,
  ScenarioId,
  ScenarioResult,
} from "@/lib/scenarios/types";
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
interface AssetRow extends Record<string, unknown> {
  asset_id: string;
  country_iso3: string;
  capacity: number;
  name: string;
}
interface LngVoyageQueryRow extends Record<string, unknown> {
  start_date: string;
  end_date: string;
  imo: number;
  voyage_type: "export" | "return";
  from_terminal: string;
  to_terminal: string;
  from_country_iso3: string;
  to_country_iso3: string;
  amount_cbm: number;
  confidence_score: number;
}

const HS_BY_COMMODITY: Record<Commodity, string> = {
  oil: "2709",
  gas: "271111",
};

export function useScenario(
  scenarioId: ScenarioId | null,
  year: number,
  commodity: Commodity,
) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  useEffect(() => {
    if (scenarioId === null) {
      void Promise.resolve().then(() => { setResult(null); });
      return;
    }
    const ctrl = { cancelled: false };
    void (async () => {
      const hs = HS_BY_COMMODITY[commodity];
      const flows = await query<FlowRow>(
        `SELECT CAST(year AS INTEGER) AS year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
         FROM read_parquet('/data/trade_flow.parquet')
         WHERE year = ? AND hs_code = ?`,
        [year, hs],
      );
      const routes = await query<RouteRow>(
        `SELECT disruption_id, kind, exporter_iso3, importer_iso3, share
         FROM read_parquet('/data/disruption_route.parquet')
         WHERE disruption_id = ?`,
        [scenarioId],
      );
      let refineries: readonly AssetRow[] | undefined;
      let lngImports: readonly AssetRow[] | undefined;
      if (commodity === "oil") {
        const r = await query<AssetRow>(
          `SELECT asset_id, name, country_iso3, COALESCE(capacity, 0) AS capacity
           FROM read_parquet('/data/assets.parquet')
           WHERE kind = 'refinery'`,
        );
        refineries = r.rows;
      } else {
        const r = await query<AssetRow>(
          `SELECT asset_id, name, country_iso3, COALESCE(capacity, 0) AS capacity
           FROM read_parquet('/data/assets.parquet')
           WHERE kind = 'lng_import'`,
        );
        lngImports = r.rows;
      }

      // Phase 6: load LNG voyages for the active year only when in LNG-T3
      // range and the commodity is gas (voyages are irrelevant to oil).
      // Outside that range the engine falls back to the BACI attribution
      // path. `confidence_score >= 3` matches LngVoyagesLayer.tsx's query so
      // both views agree on which voyages count — the engine's minConfidence
      // default (also 3) still applies this filter defensively downstream.
      const useLngT3 = commodity === "gas" && year >= 2020 && year <= 2024;
      let lngVoyages: readonly LngVoyageRow[] = [];
      if (useLngT3) {
        const r = await query<LngVoyageQueryRow>(
          `SELECT CAST(start_date AS VARCHAR) AS start_date,
                  CAST(end_date AS VARCHAR) AS end_date,
                  CAST(imo AS INTEGER) AS imo, voyage_type, from_terminal,
                  to_terminal, from_country_iso3, to_country_iso3,
                  CAST(amount_cbm AS DOUBLE) AS amount_cbm,
                  CAST(confidence_score AS INTEGER) AS confidence_score
           FROM read_parquet('/data/lng_voyage.parquet')
           WHERE voyage_type = 'export'
             AND confidence_score >= 3
             AND year(start_date) <= ${year.toString()}
             AND year(end_date) >= ${year.toString()}`,
        );
        lngVoyages = r.rows;
      }

      if (ctrl.cancelled) return;
      const raw = computeScenarioImpact({
        scenarioId,
        commodity,
        year,
        tradeFlows: flows.rows,
        routes: routes.rows,
        ...(refineries !== undefined ? { refineries } : {}),
        ...(lngImports !== undefined ? { lngImports } : {}),
        ...(lngVoyages.length > 0 ? { lngVoyages } : {}),
      });
      // The engine's RefineryImpact carries no name; attach it here so the
      // panel can show "Ruwais Refinery" rather than "ARE · 0 kbpd".
      if (refineries !== undefined) {
        const nameById = new Map(refineries.map((r) => [r.asset_id, r.name]));
        const withName = (i: RefineryImpact): RefineryImpact => {
          const name = nameById.get(i.asset_id);
          return typeof name === "string" && name.length > 0 ? { ...i, name } : i;
        };
        const byRefinery = raw.byRefinery.map(withName);
        const byId = new Map(byRefinery.map((i) => [i.asset_id, i]));
        setResult({
          ...raw,
          byRefinery,
          rankedRefineries: raw.rankedRefineries.map((i) => byId.get(i.asset_id) ?? i),
        });
      } else {
        setResult(raw);
      }
    })();
    return () => { ctrl.cancelled = true; };
  }, [scenarioId, year, commodity]);
  return result;
}
