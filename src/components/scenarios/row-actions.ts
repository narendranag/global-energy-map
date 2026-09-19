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
import { FIT_MAX_ZOOM, type CameraPadding } from "@/lib/state";
import { peekAppStore } from "@/lib/state/store";

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

/** A ranked asset row: fly to the plant itself. */
export function goToAsset(lon: number, lat: number): void {
  peekAppStore()?.requestCamera({ kind: "flyTo", lon, lat, zoom: ASSET_FLY_ZOOM });
}
