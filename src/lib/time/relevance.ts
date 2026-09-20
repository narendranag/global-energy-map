/**
 * Is the year control doing anything right now?
 *
 * The year is never removed from the model - the scenario engine is
 * year-parameterised (`engine.ts` filters trade rows by `input.year`, and LNG
 * in-service attribution is year-dependent), and half the layers are vintage
 * filtered. But on a screen showing only refineries and ports, the slider
 * controls nothing, and a prominent control that does nothing is worse than
 * no control: it invites the reader to conclude the data is time-invariant.
 *
 * So the control collapses when it is idle rather than disappearing. This is
 * the one place that decides, so the slider and any future affordance cannot
 * drift from each other - the same reasoning as `symbology/` owning colour.
 */
import type { LayerState } from "@/components/layers/LayerPanel";
import { TIME_AWARE } from "@/lib/symbology/time-aware";

export type YearRelevance = "active" | "idle";

/**
 * `scenarioActive` is the *primary* scenario being non-null, not the mode:
 * Scenarios mode with nothing picked yet steers no year-dependent number.
 */
export function yearRelevance(layers: LayerState, scenarioActive: boolean): YearRelevance {
  if (scenarioActive) return "active";
  for (const [key, visible] of Object.entries(layers)) {
    if (!visible) continue;
    // "live" layers (GIE, Comtrade) carry dates but deliberately ignore the
    // slider, so they must not keep it expanded - see TIME_AWARE_NOTE.
    const level = TIME_AWARE[key as keyof LayerState];
    if (level === "yes" || level === "partial") return "active";
  }
  return "idle";
}
