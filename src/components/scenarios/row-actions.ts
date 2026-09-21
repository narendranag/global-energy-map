"use client";
/**
 * What a ranked scenario row does when you click it (S1).
 *
 * The panel talks to the store and the camera directly rather than through
 * callbacks threaded down from `page.tsx`: `focus` is app state the store
 * already owns (`peekAppStore().patch` is the same write `useUrlState` makes,
 * and every subscriber re-renders), and the camera is a command seam by
 * design. Adding two more props to `ScenarioPanel` for it would make the page
 * a relay for a decision it has no part in.
 */
import { countryBounds } from "@/lib/geo/bounds";
import type { ExampleQuestion } from "@/lib/modes";
import { FIT_MAX_ZOOM, type CameraPadding } from "@/lib/state";
import { peekAppStore } from "@/lib/state/store";
import { scenarioCameraPadding } from "./fit";

/** Zoom a "fly to this refinery / terminal" lands at: the plant and its port. */
export const ASSET_FLY_ZOOM = 8;

/** Select a country (URL `focus=`), exactly as a click on the map does. */
export function focusCountry(iso3: string): void {
  peekAppStore()?.patch({ focus: iso3 });
}

/**
 * A ranked importer row: select the country and frame it, clear of the
 * panels. Resolves false when we hold no polygon for it (it is still
 * selected — only the camera stays put).
 */
export async function goToCountry(
  iso3: string,
  padding: Partial<CameraPadding>,
): Promise<boolean> {
  focusCountry(iso3);
  const bounds = await countryBounds(iso3);
  if (bounds === null) return false;
  peekAppStore()?.requestCamera({
    kind: "fitBounds",
    bounds,
    padding,
    maxZoom: FIT_MAX_ZOOM,
  });
  return true;
}

/**
 * A ranked asset row: fly to the plant itself, clear of the panels.
 *
 * The padding is the same `scenarioCameraPadding` every other move made from
 * this panel uses (finding 14): a fly-to used to drop the refinery dead
 * centre, which on a desktop is a third of the way behind the panel that
 * ranked it. `flyTo` applies it as a one-shot offset (see `camera.ts`).
 */
export function goToAsset(lon: number, lat: number): void {
  const store = peekAppStore();
  // Unlike a country row, this one selects nothing, so the country panel is
  // in the way only when one is already open — which the store knows.
  const padding = scenarioCameraPadding(store?.getApp().focus != null);
  store?.requestCamera({ kind: "flyTo", lon, lat, zoom: ASSET_FLY_ZOOM, padding });
}

/**
 * Apply an example question from inside the scenario panel — the same write
 * `IntroCard`'s chips make through `page.tsx`, made here for the same reason
 * the row actions above are: the store already owns `AppState`, and threading
 * a callback through the page for a state change the page has no part in
 * would make it a relay.
 *
 * The scenario camera needs nothing extra: the fit is keyed on *what is
 * closed*, so a question that picks a scenario changes the key and frames the
 * result exactly as the picker does.
 */
export function applyExample(q: ExampleQuestion): void {
  peekAppStore()?.patch(q.state);
}
