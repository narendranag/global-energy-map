"use client";
/**
 * Move the camera when the viewer *changes* the scenario (S1).
 *
 * The rules, in one place because every one of them is a judgement call:
 *
 *  - **It fires on a change of scenario, by whatever route** — the picker, an
 *    example question, a country-panel row. Not on a year or commodity
 *    change: those recompute the result, and re-framing under the viewer's
 *    hands while they drag the slider is the opposite of helpful.
 *  - **Not on load when the URL carries an explicit `lon`/`lat`/`z`.** Same
 *    rule S0 set for `focus`: a shared link's view is what the sharer chose
 *    to show, and it wins. `allowInitialFit` carries that decision in.
 *  - **It waits for the result, then fires once.** Activating a scenario
 *    posts the intent; the fit happens when the exposure for *that* scenario
 *    arrives (and, for a pipeline scenario, when its geometry has placed the
 *    mark). Later recomputes of the same scenario never re-fit.
 *  - **It frames the mark plus the top exposed importers**, padded clear of
 *    the panels, so the countries the panel ranks are not sitting under the
 *    panel that ranks them.
 *
 * `prefers-reduced-motion` needs nothing here: MapShell honours it for every
 * camera command.
 */
import { useEffect, useRef } from "react";
import { countryBoundsFrom } from "@/lib/geo/bounds";
import { loadCountries } from "@/lib/geo/countries";
import type { Bounds, CameraPadding } from "@/lib/state";
import { useCamera } from "@/lib/state";
import type { ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import { SCENARIO_FIT_MAX_ZOOM, scenarioFitBounds, topExposedIso3 } from "./fit";

export interface ScenarioCameraInput {
  readonly scenarioId: ScenarioId | null;
  /** The disruption mark, once it can be placed (null for an unplaceable one). */
  readonly mark: { readonly lon: number; readonly lat: number } | null;
  /** True while the mark cannot be placed *yet* (a pipeline route still loading). */
  readonly markPending: boolean;
  readonly result: ScenarioResult | null;
  /** False when the initial URL carried an explicit camera. */
  readonly allowInitialFit: boolean;
  readonly padding: Partial<CameraPadding>;
}

export function useScenarioCamera({
  scenarioId,
  mark,
  markPending,
  result,
  allowInitialFit,
  padding,
}: ScenarioCameraInput): void {
  const camera = useCamera();
  /** `undefined` until the first render has been seen; then the last scenario. */
  const seen = useRef<ScenarioId | null | undefined>(undefined);
  /** The scenario whose result we are waiting on before fitting. */
  const awaiting = useRef<ScenarioId | null>(null);

  useEffect(() => {
    const first = seen.current === undefined;
    if (!first && seen.current === scenarioId) return;
    seen.current = scenarioId;
    if (scenarioId === null) {
      awaiting.current = null;
      return;
    }
    // The load-time case: an explicit view in the link beats the fit.
    if (first && !allowInitialFit) return;
    awaiting.current = scenarioId;
  }, [scenarioId, allowInitialFit]);

  useEffect(() => {
    const want = awaiting.current;
    if (want === null) return;
    // Still computing this scenario's exposure, or still placing its mark.
    if (result?.scenarioId !== want || markPending) return;
    awaiting.current = null;

    // A mutable flag object, as in `useAsync`. Only one await follows, so one
    // check after it covers the whole body.
    const ctrl = { cancelled: false };
    void (async () => {
      const fc = await loadCountries();
      if (ctrl.cancelled) return;
      const boxes = topExposedIso3(result.byImporter)
        .map((iso3) => countryBoundsFrom(fc, iso3))
        .filter((b): b is Bounds => b !== null);
      const bounds = scenarioFitBounds(mark, boxes);
      if (bounds === null) return;
      camera.request({ kind: "fitBounds", bounds, padding, maxZoom: SCENARIO_FIT_MAX_ZOOM });
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [result, mark, markPending, camera, padding]);
}
