"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { adoptAppStore } from "@/lib/state/store";
import type { AppState } from "./encode";

/**
 * Thin React binding over the app store (`src/lib/state/store.ts`).
 *
 * State lives in memory; the URL is written by the store with a debounced
 * `history.replaceState` — never `router.replace`, so a slider tick is not a
 * Next navigation (R16). Consecutive setter calls compose synchronously.
 *
 * `useSearchParams()` is read only to seed the store on mount: it is the one
 * source that agrees between the server render and the first client render
 * (so no hydration mismatch), and it keeps this page's client-rendering
 * boundary exactly where it was. Later URL changes come *from* the store, so
 * its value is ignored after mount.
 */
export function useUrlState(defaults: AppState): [
  AppState,
  (next: Partial<AppState>) => void,
] {
  const searchParams = useSearchParams();
  const [store] = useState(() => adoptAppStore(defaults, searchParams.toString()));

  const state = useSyncExternalStore(store.subscribe, store.getApp, store.getApp);

  // Leaving the page drops a not-yet-written URL update rather than letting
  // it land on the next route.
  useEffect(() => () => { store.cancel(); }, [store]);

  return [state, store.patch];
}
