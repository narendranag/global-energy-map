import type {
  Commodity,
  RouteRow,
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

/** The citation columns `disruption_route.parquet` carries beside each share. */
export interface RouteCitation {
  readonly source_title: string;
  /** "" when unsourced. */
  readonly source_url: string;
  readonly source_year: number | null;
  readonly source_note: string;
}

/**
 * A route share plus its provenance (review R6). The engine only reads the
 * `RouteRow` fields; the citation columns are for the scenario panel's
 * "Route shares used" list.
 *
 * It is `RouteRow & …` rather than an interface extending one row shape
 * because `RouteRow` is the union of the exporter-side and the inbound
 * (importer-wide, `exporter_iso3: null`) row — S5's wildcard. Typing it as
 * the non-null `DisruptionRouteRow` was review finding 1: an inbound row
 * would have been read with a non-null exporter it does not have.
 */
export type RouteShareRow = RouteRow & RouteCitation;

/** True when the row carries no supporting document (analyst estimate). */
export function isUnsourced(r: Pick<RouteShareRow, "source_title">): boolean {
  return r.source_title === UNSOURCED_TITLE;
}

export { routeKeyFor };

const ROUTE_COLUMNS = [
  "disruption_id", "kind", "exporter_iso3", "importer_iso3", "share",
  "source_title", "source_url", "source_year", "source_note",
] as const;

/**
 * The parquet's own shape: both sides nullable (an inbound row has no
 * exporter; an exporter-wide row has no importer), citations nullable.
 */
interface RouteFileRow {
  readonly disruption_id: string;
  readonly kind: "chokepoint" | "pipeline";
  readonly exporter_iso3: string | null;
  readonly importer_iso3: string | null;
  readonly share: number;
  readonly source_title: string | null;
  readonly source_url: string | null;
  readonly source_year: number | null;
  readonly source_note: string | null;
}

/** A file row as an engine row, or null for a row that names neither side. */
function toRouteShareRow(r: RouteFileRow, scenarioId: ScenarioId): RouteShareRow | null {
  const citation: RouteCitation = {
    source_title: r.source_title ?? "",
    source_url: r.source_url ?? "",
    source_year: r.source_year,
    source_note: r.source_note ?? "",
  };
  // "Everything, everywhere" is not a route (see resolveScenarioShare).
  if (r.exporter_iso3 === null && r.importer_iso3 === null) return null;
  if (r.exporter_iso3 === null) {
    return {
      disruption_id: scenarioId,
      kind: r.kind,
      exporter_iso3: null,
      importer_iso3: r.importer_iso3 ?? "",
      share: r.share,
      ...citation,
    };
  }
  return {
    disruption_id: scenarioId,
    kind: r.kind,
    exporter_iso3: r.exporter_iso3,
    importer_iso3: r.importer_iso3,
    share: r.share,
    ...citation,
  };
}

export const loadRoutes = cachedLoader(
  async (scenarioId: ScenarioId, commodity: Commodity): Promise<readonly RouteShareRow[]> => {
    const rows = await readParquet<RouteFileRow>("/data/disruption_route.parquet", ROUTE_COLUMNS);
    const key = routeKeyFor(scenarioId, commodity);
    // No key = the scenario says nothing about this commodity (A1). The UI
    // clears such a pairing, so this is a guard, not an expected path.
    if (key === null) return [];
    // The engine and panel match rows on the active scenario id, so rows
    // stored under the commodity's route key (`hormuz_lng`) are re-labelled
    // with the scenario's own id here. That relabelling is what makes the
    // engine's per-scenario filter work for a *combined* run too (review
    // finding 4): each scenario's rows arrive already keyed by its own id.
    return rows.flatMap((r) => {
      if (r.disruption_id !== key) return [];
      const row = toRouteShareRow(r, scenarioId);
      return row === null ? [] : [row];
    });
  },
);

/** Everything the scenario engine needs besides asset rows (see useAssets). */
export interface ScenarioInputs {
  readonly scenarioId: ScenarioId;
  /** T1: every scenario these inputs cover, primary first. */
  readonly scenarioIds: readonly ScenarioId[];
  readonly year: number;
  readonly commodity: Commodity;
  readonly tradeFlows: readonly TradeFlowRow[];
  /** Route shares with citations (the engine ignores the citation fields). */
  readonly routes: readonly RouteShareRow[];
  /** LNG-T3 voyages for gas in 2020–2024; [] otherwise (engine uses BACI). */
  readonly lngVoyages: readonly VoyageRow[];
}

/**
 * The scenario's queries, run in parallel (R19).
 *
 * `secondary` is the T1 combined-scenario slot: `""` for none. Each scenario's
 * rows are read under **its own** route key (`routeKeyFor(id, commodity)`) and
 * re-labelled with its own id by `loadRoutes`, which is what lets the engine's
 * per-id filter see two distinct sets — review finding 4, where a combined gas
 * run over raw parquet rows found nothing for Hormuz because its rows live
 * under `hormuz_lng`.
 *
 * A secondary that resolves to no rows at all is a mistake we would otherwise
 * report as a confident "no extra exposure", so it warns loudly and is
 * dropped rather than silently combined.
 */
export async function loadScenarioInputs(
  scenarioId: ScenarioId,
  year: number,
  commodity: Commodity,
  secondary: ScenarioId | "" = "",
): Promise<ScenarioInputs> {
  const wanted: readonly ScenarioId[] =
    secondary === "" || secondary === scenarioId ? [scenarioId] : [scenarioId, secondary];
  const [tradeFlows, routeSets, lngVoyages] = await Promise.all([
    loadTradeFlows(year, commodity),
    Promise.all(wanted.map((id) => loadRoutes(id, commodity))),
    commodity === "gas" ? loadVoyages(year) : Promise.resolve([]),
  ]);
  const scenarioIds: ScenarioId[] = [];
  const routes: RouteShareRow[] = [];
  for (const [i, id] of wanted.entries()) {
    const rows = routeSets[i] ?? [];
    if (rows.length === 0) {
      // Never silently combine a scenario that contributes nothing: for the
      // primary that is the pre-existing "no rows for this axis" case the UI
      // already guards, for a secondary it would be an invisible no-op.
      console.warn(
        `scenario "${id}" has no ${commodity} route rows (key ${String(routeKeyFor(id, commodity))}); it is not combined`,
      );
      if (i > 0) continue;
    }
    scenarioIds.push(id);
    routes.push(...rows);
  }
  return {
    scenarioId,
    scenarioIds,
    year,
    commodity,
    tradeFlows,
    routes,
    lngVoyages,
  };
}
