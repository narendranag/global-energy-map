/**
 * How a scenario is *named* in prose — one helper, because it is written in
 * two places that must agree: ShareMenu's "View + sources" citation summary
 * and the embed chip that stands in for the whole scenario panel under
 * `?embed=1`.
 *
 * The chip used to name only the primary scenario (finding 11), so an
 * embedded map of "Hormuz + Malacca at 50 %, exporter view" announced itself
 * as "Hormuz" — the one line a reader of an embed has to go on.
 *
 * Pure, no React. Unit-tested in `tests/unit/scenarios/summary.test.ts`.
 */
import { getScenario, severityPct } from "./registry";
import { routeShareYears, type DatedRouteRow } from "./vintage";
import type { ScenarioId } from "./types";
import type { ScenarioView } from "@/lib/url-state/encode";

/** The scenario part of `AppState` — what these functions need and no more. */
export interface ScenarioNaming {
  readonly scenario: ScenarioId | null;
  readonly scenario2: ScenarioId | null;
  /** Fraction of the route(s) cut, 0–1. */
  readonly severity: number;
  readonly view: ScenarioView;
}

/** "Strait of Hormuz" / "Strait of Hormuz + Malacca", or null when none is active. */
export function scenarioLabelOf(
  scenario: ScenarioId | null,
  scenario2: ScenarioId | null,
): string | null {
  if (scenario === null) return null;
  const ids = scenario2 === null || scenario2 === scenario ? [scenario] : [scenario, scenario2];
  return ids.map((id) => getScenario(id).label).join(" + ");
}

/**
 * How the vintages behind a result are *said*, everywhere they are said: the
 * scenario headline in the panel, the citation summary, the embed chip, the
 * CSV header and the "how this is computed" disclosure.
 *
 * Nobody picks the year any more (there is no year control), so a year is no
 * longer a setting the reader chose — it is a property of the data the answer
 * is built on. And the headline number is not trade alone: it is trade ×
 * route share, and the shares carry their own publication years (Suez 2019,
 * Malacca 2017–2026). Naming only the trade year made a 2019-routing result
 * read as current, so both are always named, in one place, in the same words.
 *
 * "2024 trade, 2019 route shares"
 * "2024 trade, 2017–2026 route shares"   (an en dash; full years, never 2017–26)
 * "2024 trade, undated route shares"     (rows exist, none carries a document year)
 * "2024 trade"                           (routes not loaded yet — never a wrong year)
 *
 * `routes` is every route row behind the result, both scenarios' rows when
 * two are combined. `null` means "not loaded": callers that can wait should
 * wait rather than print a phrase that is about to change.
 */
export function dataYearsPhrase(
  tradeYear: number,
  routes: readonly DatedRouteRow[] | null,
): string {
  const trade = `${tradeYear.toString()} trade`;
  if (routes === null || routes.length === 0) return trade;
  const years = routeShareYears(routes);
  const first = years[0];
  const last = years[years.length - 1];
  if (first === undefined || last === undefined) return `${trade}, undated route shares`;
  const span = first === last ? first.toString() : `${first.toString()}\u2013${last.toString()}`;
  return `${trade}, ${span} route shares`;
}

/**
 * Everything the scenario controls say, as display parts in a fixed order:
 * what is closed, which trade year it is computed on, how much of it, and
 * which side is being listed. Each modifier appears only when it is not the
 * default, so a plain full closure reads exactly as it did before T1.
 *
 * `noneLabel` is what stands in when no scenario is active — "no scenario"
 * in a citation, "Scenario" on a button.
 *
 * `tradeYear` is optional because the parts are also used where the year is
 * already printed beside them; where it is given it follows the scenario
 * label, and it is dropped with every other modifier when no scenario is
 * active (a trade year describes a result, and there is none). `routes` goes
 * with it: given both, the part names the route-share years too, through the
 * same `dataYearsPhrase` the panel headline uses, so a citation and a chip
 * cannot state a different vintage from the number they describe.
 */
export function scenarioSummaryParts(
  s: ScenarioNaming,
  noneLabel = "no scenario",
  opts: { readonly tradeYear?: number; readonly routes?: readonly DatedRouteRow[] | null } = {},
): string[] {
  const active = s.scenario !== null;
  return [
    scenarioLabelOf(s.scenario, s.scenario2) ?? noneLabel,
    ...(active && opts.tradeYear !== undefined
      ? [dataYearsPhrase(opts.tradeYear, opts.routes ?? null)]
      : []),
    ...(active && s.severity < 1 ? [`${severityPct(s.severity)} of the route cut`] : []),
    ...(active && s.view === "exporters" ? ["exporter view"] : []),
  ];
}
