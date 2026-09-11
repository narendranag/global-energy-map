import { query } from "@/lib/duckdb/query";
import type {
  Commodity,
  DisruptionRouteRow,
  ScenarioId,
  TradeFlowRow,
} from "@/lib/scenarios/types";
import { routeKeyFor } from "@/lib/scenarios/registry";
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

/** `source_title` value build_disruption_routing.py writes for rows no document supports. */
export const UNSOURCED_TITLE = "Analyst estimate (unsourced)";

/**
 * A route share plus its provenance (review R6). The engine only reads the
 * `DisruptionRouteRow` fields; the citation columns are for the scenario
 * panel's "Route shares used" list.
 */
export interface RouteShareRow extends DisruptionRouteRow {
  readonly source_title: string;
  /** "" when unsourced. */
  readonly source_url: string;
  readonly source_year: number | null;
  readonly source_note: string;
}

/** True when the row carries no supporting document (analyst estimate). */
export function isUnsourced(r: Pick<RouteShareRow, "source_title">): boolean {
  return r.source_title === UNSOURCED_TITLE;
}

export { routeKeyFor };

export const loadRoutes = cachedLoader(
  async (scenarioId: ScenarioId, commodity: Commodity): Promise<readonly RouteShareRow[]> => {
    const res = await query<RouteShareRow & Record<string, unknown>>(
      `SELECT disruption_id, kind, exporter_iso3, importer_iso3, share,
              COALESCE(source_title, '') AS source_title,
              COALESCE(source_url, '') AS source_url,
              source_year,
              COALESCE(source_note, '') AS source_note
       FROM read_parquet('/data/disruption_route.parquet')
       WHERE disruption_id = ?`,
      [routeKeyFor(scenarioId, commodity)],
    );
    // The engine and panel match rows on the active scenario id.
    return res.rows.map((r) => ({ ...r, disruption_id: scenarioId }));
  },
);

/** Everything the scenario engine needs besides asset rows (see useAssets). */
export interface ScenarioInputs {
  readonly scenarioId: ScenarioId;
  readonly year: number;
  readonly commodity: Commodity;
  readonly tradeFlows: readonly TradeFlowRow[];
  /** Route shares with citations (the engine ignores the citation fields). */
  readonly routes: readonly (DisruptionRouteRow & Partial<Omit<RouteShareRow, keyof DisruptionRouteRow>>)[];
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
    loadRoutes(scenarioId, commodity),
    commodity === "gas" ? loadVoyages(year) : Promise.resolve([]),
  ]);
  return { scenarioId, year, commodity, tradeFlows, routes, lngVoyages };
}
