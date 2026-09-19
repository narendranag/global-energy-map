/**
 * *When* the scenario camera fires (S1/T1), as a pure state machine.
 *
 * `useScenarioCamera` owns the refs and the side effect; everything that
 * decides whether a fit is owed lives here, because the rules are all
 * judgement calls and a combined scenario made the old version wrong: it
 * remembered only the **primary** id and matched it against
 * `result.scenarioId`, so adding, removing or swapping a *secondary* was
 * satisfied by the result that was already on screen — the camera framed the
 * previous combination's importers and then never re-fit (finding 4).
 *
 * The key is therefore the whole scenario set ("hormuz+malacca"), and the
 * result answers with its own set. Unit-tested in
 * `tests/unit/scenarios/camera-gate.test.ts`.
 */
import type { ScenarioId, ScenarioResult } from "@/lib/scenarios/types";

/** What is closed right now: `null`, "hormuz", or "hormuz+malacca". */
export function scenarioKey(
  scenarioId: ScenarioId | null,
  scenario2: ScenarioId | null,
): string | null {
  if (scenarioId === null) return null;
  return scenario2 === null ? scenarioId : `${scenarioId}+${scenario2}`;
}

/** The same key, read off a result rather than off the controls. */
export function resultScenarioKey(result: ScenarioResult | null): string | null {
  if (result === null) return null;
  const ids = result.scenarioIds ?? [result.scenarioId];
  return ids.join("+");
}

/**
 * The gate's memory: what key the last render saw (`undefined` before the
 * first), and which key's result we owe a fit to.
 */
export interface CameraGate {
  readonly seen: string | null | undefined;
  readonly awaiting: string | null;
}

export const INITIAL_GATE: CameraGate = { seen: undefined, awaiting: null };

/**
 * Fold a rendered scenario key into the gate.
 *
 * - The first key ever seen is what the page *loaded* with, and a link's view
 *   is what the sharer chose: it never owes a fit.
 * - An unchanged key changes nothing (so a year or commodity recompute does
 *   not re-frame under the viewer's hands).
 * - Clearing the scenario cancels an owed fit rather than leaving it pending
 *   for a result that will never arrive.
 */
export function observeKey(gate: CameraGate, key: string | null): CameraGate {
  if (gate.seen !== undefined && gate.seen === key) return gate;
  if (key === null) return { seen: null, awaiting: null };
  // The scenario the page loaded with is not a change the viewer made.
  if (gate.seen === undefined) return { seen: key, awaiting: null };
  return { seen: key, awaiting: key };
}

/**
 * True when the awaited scenario set is exactly the one this result covers
 * and its mark has been placed — the moment the fit is owed. The caller then
 * clears `awaiting` (see {@link fired}) so later recomputes never re-fit.
 */
export function shouldFit(
  gate: CameraGate,
  result: ScenarioResult | null,
  markPending: boolean,
): boolean {
  if (gate.awaiting === null || markPending) return false;
  return resultScenarioKey(result) === gate.awaiting;
}

/** The gate after a fit has been requested: the debt is paid. */
export function fired(gate: CameraGate): CameraGate {
  return gate.awaiting === null ? gate : { ...gate, awaiting: null };
}
