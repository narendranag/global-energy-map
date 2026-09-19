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
 * Everything the scenario controls say, as display parts in a fixed order:
 * what is closed, how much of it, and which side is being listed. Each
 * modifier appears only when it is not the default, so a plain full closure
 * reads exactly as it did before T1.
 *
 * `noneLabel` is what stands in when no scenario is active — "no scenario"
 * in a citation, "Scenario" on a button.
 */
export function scenarioSummaryParts(
  s: ScenarioNaming,
  noneLabel = "no scenario",
): string[] {
  return [
    scenarioLabelOf(s.scenario, s.scenario2) ?? noneLabel,
    ...(s.scenario !== null && s.severity < 1 ? [`${severityPct(s.severity)} of the route cut`] : []),
    ...(s.scenario !== null && s.view === "exporters" ? ["exporter view"] : []),
  ];
}
