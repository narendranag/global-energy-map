"use client";
import { useSyncExternalStore } from "react";
import { peekAppStore } from "./store";

const noop = () => undefined;

function subscribe(listener: () => void): () => void {
  return peekAppStore()?.subscribe(listener) ?? noop;
}

function getSnapshot(): number | null {
  return peekAppStore()?.getApp().year ?? null;
}

// Server render and hydration must agree: null there, even when the client
// store already holds a URL-restored year (mirrors useMapView.ts).
function getServerSnapshot(): number | null {
  return null;
}

/**
 * The active `AppState.year` from the app store, or `null` before a page has
 * adopted it (and on the server). There is no longer a control that lets a
 * visitor choose this — the map reads at the latest reconciled trade year
 * unless a link pins an older one (see `AsOfChip`) — but the value is still
 * read reactively wherever a component needs the year without threading it
 * down as a prop (e.g. `LayerPanel`'s trade-flows "no data this year" badge,
 * A8); everywhere else still reads `year` from `useUrlState`/props as usual.
 */
export function useAppYear(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
