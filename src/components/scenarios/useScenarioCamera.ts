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
 *  - **Never on load.** A link's view is what the sharer chose to show, and
 *    it wins — the strong form of the rule S0 set for `focus`, where an
 *    explicit `lon`/`lat`/`z` beats the load-time fit. Re-framing a
 *    `?scenario=hormuz` link on arrival would also silently rewrite the
 *    camera in every such link ever shared. The fit is a response to a
 *    *change* the viewer makes, not to state they arrived with.
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
  /**
   * T1: the second scenario of a combined run, or null. Adding or removing
   * one is a change of *what is closed*, so it re-frames exactly as picking a
   * different scenario does.
   */
  readonly scenario2?: ScenarioId | null;
  /** Every placed disruption mark (empty while none can be placed). */
  readonly marks: readonly { readonly lon: number; readonly lat: number }[];
  /** True while a mark cannot be placed *yet* (a pipeline route still loading). */
  readonly markPending: boolean;
  readonly result: ScenarioResult | null;
  readonly padding: Partial<CameraPadding>;
  /** T1: which side's countries the fit frames — whichever the panel lists. */
  readonly view?: "importers" | "exporters";
}

export function useScenarioCamera({
  scenarioId,
  scenario2 = null,
  marks,
  markPending,
  result,
  padding,
  view = "importers",
}: ScenarioCameraInput): void {
  const camera = useCamera();
  /** What is closed right now: `null`, "hormuz", or "hormuz+malacca". */
  const key = scenarioId === null ? null : `${scenarioId}${scenario2 === null ? "" : `+${scenario2}`}`;
  /** `undefined` until the first render has been seen; then the last key. */
  const seen = useRef<string | null | undefined>(undefined);
  /** The scenario whose result we are waiting on before fitting. */
  const awaiting = useRef<ScenarioId | null>(null);

  useEffect(() => {
    const first = seen.current === undefined;
    if (!first && seen.current === key) return;
    seen.current = key;
    if (scenarioId === null) {
      awaiting.current = null;
      return;
    }
    // The scenario the page loaded with is not a change the viewer made.
    if (first) return;
    awaiting.current = scenarioId;
  }, [key, scenarioId]);

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
      const exposed = view === "exporters" ? result.byExporter ?? [] : result.byImporter;
      const boxes = topExposedIso3(exposed)
        .map((iso3) => countryBoundsFrom(fc, iso3))
        .filter((b): b is Bounds => b !== null);
      const bounds = scenarioFitBounds(marks, boxes);
      if (bounds === null) return;
      camera.request({ kind: "fitBounds", bounds, padding, maxZoom: SCENARIO_FIT_MAX_ZOOM });
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [result, marks, markPending, camera, padding, view]);
}
