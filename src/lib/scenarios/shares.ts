import type { RouteRow, ScenarioId } from "./types";

/** Share of a flow that moves on the disrupted route, 0–1. */
export type ShareLookup = (exporter: string, importer: string) => number;

/**
 * How one scenario's `disruption_route` rows resolve to a share for a given
 * (exporter, importer) flow.
 *
 * A row can describe a flow three ways, and the rule is **specific first,
 * then the union of what is left**:
 *
 *  1. **Exact pair** (both sides set) — the most specific statement there is,
 *     and it wins outright, *including share 0*. This is what keeps the 54
 *     intra-Gulf Hormuz pairs at zero: cargo from Iraq to Kuwait never leaves
 *     the Gulf, whatever the exporter-wide or importer-wide rows say.
 *  2. **Exporter-wide** (`importer_iso3 = null`) — the fraction of that
 *     exporter's exports that transits the route. The original wildcard.
 *  3. **Importer-wide** (`exporter_iso3 = null`) — the fraction of that
 *     importer's imports that transits the route. Added for inbound exposure:
 *     the Gulf states' own imports (refined product, LPG, LNG) must cross the
 *     same strait, and no exporter-side row can express that.
 *
 * When both wildcards describe one flow we take the **larger** of the two, not
 * a precedence order. Both are claims about the same physical transit of the
 * same cargo — a barrel either crosses the strait or it does not — so the set
 * of cargo at risk is the union of the two claims, and for one route the union
 * is exactly the maximum. Choosing max rather than "importer beats exporter"
 * also means that adding a set of inbound rows can never *lower* an exposure
 * the site already publishes; it can only reveal more.
 *
 * A row with neither side set is ignored: "everything, everywhere" is not a
 * route, and reading it as one would silently cut the whole world.
 */
export function resolveScenarioShare(rows: readonly RouteRow[]): ShareLookup {
  const pair = new Map<string, number>();
  const byExporter = new Map<string, number>();
  const byImporter = new Map<string, number>();
  for (const r of rows) {
    // Read both sides as nullable: the union rules out (null, null) at compile
    // time, but the parquet these rows come from does not.
    const exporter: string | null = r.exporter_iso3;
    const importer: string | null = r.importer_iso3;
    if (exporter !== null && importer !== null) pair.set(`${exporter}→${importer}`, r.share);
    else if (exporter !== null) byExporter.set(exporter, r.share);
    else if (importer !== null) byImporter.set(importer, r.share);
  }
  return (exporter, importer) => {
    const exact = pair.get(`${exporter}→${importer}`);
    if (exact !== undefined) return exact;
    return Math.max(byExporter.get(exporter) ?? 0, byImporter.get(importer) ?? 0);
  };
}

/** The two bounds on a combined share; identical for a single scenario. */
export interface ShareBounds {
  /** max over scenarios — the flow is cut at least this much. */
  readonly lower: number;
  /** min(1, Σ) — it cannot be cut more than this. */
  readonly upper: number;
}

export type BoundsLookup = (exporter: string, importer: string) => ShareBounds;

/**
 * Combine several scenarios' shares for one flow.
 *
 * We know what fraction of a flow each route carries, but not *which* cargoes,
 * so for two closures A and B the truly-cut fraction |A ∪ B| is unknown. It is,
 * however, bounded — and both bounds are arithmetic facts, not modelling
 * assumptions:
 *
 *   max(a, b)  ≤  |A ∪ B|  ≤  min(1, a + b)
 *
 * The lower bound is reached when the routes are **in series** — the same
 * barrels cross both, e.g. Qatari LNG to Japan transits Hormuz *and* Malacca,
 * so closing both cuts that cargo once. The upper bound is reached when they
 * are **in parallel** — different barrels, e.g. Russian crude reaching Germany
 * either by Druzhba or by sea, so the closures add.
 *
 * `1 − (1 − a)(1 − b)` — independent-probability composition — is not
 * defensible here: these are fixed physical routings, not independent random
 * events, and it lands between the bounds for no reason anyone can cite.
 *
 * The engine therefore reports **both**: every number is headlined at the
 * lower bound (the defensible "at least this much"), with the upper bound
 * carried alongside as the other end of the range. With one scenario the two
 * coincide, so nothing existing moves.
 *
 * Each scenario's own rows are resolved to a single share *first*
 * (`resolveScenarioShare`, pair beats wildcards), so a share-0 pair row still
 * removes that flow from its scenario before any combining happens.
 */
export function combineShares(lookups: readonly ShareLookup[]): BoundsLookup {
  return (e, i) => {
    let lower = 0;
    let sum = 0;
    for (const lookup of lookups) {
      // Clamp each share to [0, 1] before combining (review finding 5). A row
      // outside that range is a data error — `build_disruption_routing.py`
      // now asserts against it — but if one ever arrives, the two bounds must
      // still bracket each other: an unclamped share of 1.4 gave
      // lower = 1.4 > upper = min(1, 1.4) = 1, an inverted "range" every
      // reader downstream would have printed as fact.
      const raw = lookup(e, i);
      const s = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
      if (s > lower) lower = s;
      sum += s;
    }
    return { lower, upper: Math.min(1, sum) };
  };
}

/** The scenarios a run covers: `scenarioIds` when given, else `[scenarioId]`. */
export function scenarioIdsOf(input: {
  readonly scenarioId: ScenarioId;
  readonly scenarioIds?: readonly ScenarioId[];
}): readonly [ScenarioId, ...ScenarioId[]] {
  const ids = input.scenarioIds ?? [];
  const unique = [...new Set(ids)];
  const [first, ...rest] = unique;
  return first === undefined ? [input.scenarioId] : [first, ...rest];
}
