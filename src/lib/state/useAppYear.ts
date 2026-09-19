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
 * The active year slider value from the app store, or `null` before a page
 * has adopted it (and on the server). A thin reactive read for components
 * that need the year but are not the ones threading it down as a prop (e.g.
 * `LayerPanel`'s trade-flows "no data this year" badge, A8) — everywhere else
 * still reads `year` from `useUrlState`/props as usual.
 */
export function useAppYear(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
