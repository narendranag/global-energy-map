"use client";
/**
 * What Enter/click on a search result does. Goes through the same seams
 * every other selection uses — `peekAppStore().patch` for focus/layers (S0),
 * `useCamera()` for movement — so search needs no new state of its own
 * beyond the transient highlight (`highlight.ts`).
 */
import type { LayerState } from "@/components/layers/LayerPanel";
import type { Camera } from "@/lib/state/useCamera";
import { panelPadding } from "@/lib/state/camera";
import { peekAppStore } from "@/lib/state/store";
import { FEATURE_FIT_MAX_ZOOM } from "./build";
import { setSearchHighlight } from "./highlight";
import type { SearchItem } from "./types";

/** Whether the scenario panel (right side) is currently on screen. */
function scenarioPanelOpen(): boolean {
  const app = peekAppStore()?.getApp();
  return app !== undefined && (app.mode === "scenarios" || app.scenario !== null);
}

/**
 * Move the camera to `item` and select it: a country becomes `focus` (its
 * own outline is the "found it" signal); anything else turns its layer on
 * and drops a transient highlight ring, since the outline does not apply.
 */
export function selectSearchItem(item: SearchItem, camera: Camera): void {
  const t = item.target;
  const padding = panelPadding({ right: scenarioPanelOpen() });

  if (t.action === "country") {
    setSearchHighlight(null);
    peekAppStore()?.patch({ focus: t.iso3 });
    void camera.fitCountry(t.iso3, { padding });
    return;
  }

  // `patch` merges `layers` per key at runtime (store.ts) even though its
  // type asks for a full `LayerState` — one key is enough, so the cast is safe.
  peekAppStore()?.patch({ layers: { [t.layerKey]: true } as unknown as LayerState });
  setSearchHighlight({ id: item.id, lon: t.lon, lat: t.lat });
  if (t.action === "flyTo") {
    camera.request({ kind: "flyTo", lon: t.lon, lat: t.lat, zoom: t.zoom });
    return;
  }
  camera.request({ kind: "fitBounds", bounds: t.bounds, padding, maxZoom: FEATURE_FIT_MAX_ZOOM });
}
