/**
 * "Is this result the one the controls are describing?" — the one comparison
 * three places need (the page's `pending`/`data-ready` count, the scenario
 * panel's "Computing exposure…" gate, and ShareMenu's CSV button), written
 * once so they cannot disagree.
 *
 * The subtle half is the scenario set. `loadScenarioInputs` **drops** a
 * secondary scenario with no route rows for the axis rather than combining a
 * silent no-op, so `result.scenarioIds` can legitimately be shorter than what
 * the URL says. Comparing against `scenarioIds` therefore left the page
 * permanently pending — `data-ready` never true, the panel stuck on
 * "Computing exposure…", the CSV button disabled for ever (finding 20). The
 * result carries `requestedScenarioIds`: what was *asked for*, which is what
 * the controls can be compared with.
 *
 * Pure. Unit-tested in `tests/unit/scenarios/current.test.ts`.
 */
import type { Commodity, ScenarioId, ScenarioResult } from "./types";

/** The scenario set as the controls (and the URL) describe it. */
export interface ScenarioRequest {
  readonly scenario: ScenarioId | null;
  readonly scenario2: ScenarioId | null;
  readonly year: number;
  readonly commodity: Commodity;
  /** Fraction of the route(s) cut, 0–1. */
  readonly severity: number;
}

/**
 * Which scenarios a result was asked to cover. Falls back to what it actually
 * covers (and then to the primary alone) for results built before T1 and for
 * the fixtures that stand in for them.
 */
export function requestedIdsOf(result: ScenarioResult): readonly ScenarioId[] {
  return result.requestedScenarioIds ?? result.scenarioIds ?? [result.scenarioId];
}

function sameIds(a: readonly ScenarioId[], b: readonly ScenarioId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * True when `result` is the answer to `req`. False for a null result and —
 * deliberately — for a request with no scenario at all: there is nothing to
 * be current with, and callers gate on the scenario being set anyway.
 */
export function isCurrentScenarioResult(
  result: ScenarioResult | null,
  req: ScenarioRequest,
): boolean {
  if (result === null || req.scenario === null) return false;
  const wanted: ScenarioId[] =
    req.scenario2 === null || req.scenario2 === req.scenario
      ? [req.scenario]
      : [req.scenario, req.scenario2];
  return (
    result.scenarioId === req.scenario &&
    result.year === req.year &&
    result.commodity === req.commodity &&
    (result.severity ?? 1) === req.severity &&
    sameIds(requestedIdsOf(result), wanted)
  );
}
