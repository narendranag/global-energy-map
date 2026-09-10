import { query } from "@/lib/duckdb/query";
import type {
  Commodity,
  DisruptionRouteRow,
  ScenarioId,
  TradeFlowRow,
} from "@/lib/scenarios/types";
import { cachedLoader } from "./cache";
import { loadVoyages, type VoyageRow } from "./voyages";

const HS_BY_COMMODITY: Record<Commodity, string> = {
  oil: "2709",
  gas: "271111",
};

export const loadTradeFlows = cachedLoader(
  async (year: number, commodity: Commodity): Promise<readonly TradeFlowRow[]> => {
    const res = await query<TradeFlowRow & Record<string, unknown>>(
      `SELECT year, importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
       FROM read_parquet('/data/trade_flow.parquet')
       WHERE year = ? AND hs_code = ?`,
      [year, HS_BY_COMMODITY[commodity]],
    );
    return res.rows;
  },
);

export const loadRoutes = cachedLoader(
  async (scenarioId: ScenarioId): Promise<readonly DisruptionRouteRow[]> => {
    const res = await query<DisruptionRouteRow & Record<string, unknown>>(
      `SELECT disruption_id, kind, exporter_iso3, importer_iso3, share
       FROM read_parquet('/data/disruption_route.parquet')
       WHERE disruption_id = ?`,
      [scenarioId],
    );
    return res.rows;
  },
);

/** Everything the scenario engine needs besides asset rows (see useAssets). */
export interface ScenarioInputs {
  readonly scenarioId: ScenarioId;
  readonly year: number;
  readonly commodity: Commodity;
  readonly tradeFlows: readonly TradeFlowRow[];
  readonly routes: readonly DisruptionRouteRow[];
  /** LNG-T3 voyages for gas in 2020–2024; [] otherwise (engine uses BACI). */
  readonly lngVoyages: readonly VoyageRow[];
}

/** The scenario's queries, run in parallel (R19). */
export async function loadScenarioInputs(
  scenarioId: ScenarioId,
  year: number,
  commodity: Commodity,
): Promise<ScenarioInputs> {
  const [tradeFlows, routes, lngVoyages] = await Promise.all([
    loadTradeFlows(year, commodity),
    loadRoutes(scenarioId),
    commodity === "gas" ? loadVoyages(year) : Promise.resolve([]),
  ]);
  return { scenarioId, year, commodity, tradeFlows, routes, lngVoyages };
}
