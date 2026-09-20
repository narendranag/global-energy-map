"use client";
/**
 * Transient "you are here" ring for a search result: not app state, not
 * URL-serialised — a one-shot UI marker the map layer stack reads (see
 * `src/components/layers/SearchHighlightLayer.tsx`). Cleared on the next
 * search or Escape, or when a country is picked instead (its own focus
 * outline already makes it findable).
 *
 * Same shape as the camera command seam (`src/lib/state/camera.ts`): plain
 * module state + a subscribe list, read through `useSyncExternalStore`.
 */
import { useSyncExternalStore } from "react";

export interface SearchHighlightTarget {
  readonly id: string;
  readonly lon: number;
  readonly lat: number;
}

let current: SearchHighlightTarget | null = null;
const listeners = new Set<() => void>();

export function setSearchHighlight(next: SearchHighlightTarget | null): void {
  current = next;
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SearchHighlightTarget | null {
  return current;
}

function getServerSnapshot(): SearchHighlightTarget | null {
  return null;
}

/** The active highlight target, or null. */
export function useSearchHighlight(): SearchHighlightTarget | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test hook: forget the module-level target between specs. */
export function resetSearchHighlightForTests(): void {
  current = null;
}
