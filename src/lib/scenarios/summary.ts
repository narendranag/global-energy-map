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
 * How a result's trade year is *said*, everywhere it is said: the scenario
 * headline in the panel, the citation summary and the embed chip.
 *
 * Nobody picks the year any more (there is no year control), so the number
 * is no longer a setting the reader chose — it is a property of the data the
 * answer is built on, and every place that prints it says so in the same
 * words.
 */
export function tradeYearPhrase(year: number): string {
  return `on ${year.toString()} trade`;
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
 * active (a trade year describes a result, and there is none).
 */
export function scenarioSummaryParts(
  s: ScenarioNaming,
  noneLabel = "no scenario",
  opts: { readonly tradeYear?: number } = {},
): string[] {
  const active = s.scenario !== null;
  return [
    scenarioLabelOf(s.scenario, s.scenario2) ?? noneLabel,
    ...(active && opts.tradeYear !== undefined ? [tradeYearPhrase(opts.tradeYear)] : []),
    ...(active && s.severity < 1 ? [`${severityPct(s.severity)} of the route cut`] : []),
    ...(active && s.view === "exporters" ? ["exporter view"] : []),
  ];
}
