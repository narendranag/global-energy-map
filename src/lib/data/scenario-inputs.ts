import type {
  Commodity,
  DisruptionRouteRow,
  ScenarioId,
  TradeFlowRow,
} from "@/lib/scenarios/types";
import { routeKeyFor } from "@/lib/scenarios/registry";
import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";
import { loadVoyages, type VoyageRow } from "./voyages";

const HS_BY_COMMODITY: Record<Commodity, string> = {
  oil: "2709",
  gas: "271111",
};

interface TradeFileRow extends TradeFlowRow {
  readonly hs_code: string;
}

export const loadTradeFlows = cachedLoader(
  async (year: number, commodity: Commodity): Promise<readonly TradeFlowRow[]> => {
    const rows = await readParquet<TradeFileRow>("/data/trade_flow.parquet", [
      "year",
      "hs_code",
      "importer_iso3",
      "exporter_iso3",
      "qty",
    ]);
    const hs = HS_BY_COMMODITY[commodity];
    return rows
      .filter((r) => r.year === year && r.hs_code === hs)
      .map((r) => ({
        year: r.year,
        importer_iso3: r.importer_iso3,
        exporter_iso3: r.exporter_iso3,
        qty: (r.qty as number | null) ?? 0,
      }));
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

const ROUTE_COLUMNS = [
  "disruption_id", "kind", "exporter_iso3", "importer_iso3", "share",
  "source_title", "source_url", "source_year", "source_note",
] as const;

type RouteFileRow = Omit<RouteShareRow, "disruption_id" | "source_title" | "source_url" | "source_note"> & {
  readonly disruption_id: string;
  readonly source_title: string | null;
  readonly source_url: string | null;
  readonly source_note: string | null;
};

export const loadRoutes = cachedLoader(
  async (scenarioId: ScenarioId, commodity: Commodity): Promise<readonly RouteShareRow[]> => {
    const rows = await readParquet<RouteFileRow>("/data/disruption_route.parquet", ROUTE_COLUMNS);
    const key = routeKeyFor(scenarioId, commodity);
    // The engine and panel match rows on the active scenario id.
    return rows
      .filter((r) => r.disruption_id === key)
      .map((r) => ({
        ...r,
        disruption_id: scenarioId,
        source_title: r.source_title ?? "",
        source_url: r.source_url ?? "",
        source_note: r.source_note ?? "",
      }));
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
