"use client";
import { useSyncExternalStore } from "react";
import { peekAppStore } from "./store";
import { DEFAULT_VIEW, type MapView } from "./view";

const noop = () => undefined;

function subscribe(listener: () => void): () => void {
  return peekAppStore()?.subscribe(listener) ?? noop;
}

function getSnapshot(): MapView {
  return peekAppStore()?.getView() ?? DEFAULT_VIEW;
}

/**
 * The current map camera `{ lon, lat, zoom }` from the app store.
 *
 * MapShell writes the view on `moveend`, so this updates once per settled
 * pan/zoom — not per animation frame — which is the right cadence for
 * zoom-gated layer visibility. Before a page has adopted the store (and on
 * the server) it returns `DEFAULT_VIEW`. The snapshot object is stable until
 * the view actually changes, so app-state patches do not re-render callers.
 */
export function useMapView(): MapView {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
