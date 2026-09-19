"use client";
/**
 * The transient link between the scenario panel's ranked rows and the map
 * (S1): what is being pointed at right now.
 *
 * A module-level external store rather than React state threaded through
 * `page.tsx`, for two reasons. It is *transient* — it is never serialised,
 * never shared, and must not touch `AppState` or the URL (that is what
 * `focus` is for). And both ends of the link are far apart in the tree: a row
 * in the scenario panel and a deck layer built beside the map. Passing it
 * through the page would add a prop to every component in between and rebuild
 * the whole layer stack on every pointer move over a list.
 *
 * Writes are compared first, so re-pointing at the same row is free, and
 * hovering the map (which fires per pointer event) does no work until the
 * country under the cursor actually changes.
 *
 * Unit-tested in `tests/unit/scenarios/hover.test.ts`.
 */
import { useSyncExternalStore } from "react";

export type ScenarioHover =
  | { readonly kind: "country"; readonly iso3: string }
  | { readonly kind: "asset"; readonly assetId: string }
  | null;

let current: ScenarioHover = null;
const listeners = new Set<() => void>();

function same(a: ScenarioHover, b: ScenarioHover): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === "country" && b.kind === "country"
    ? a.iso3 === b.iso3
    : a.kind === "asset" && b.kind === "asset" && a.assetId === b.assetId;
}

export function getScenarioHover(): ScenarioHover {
  return current;
}

export function setScenarioHover(next: ScenarioHover): void {
  if (same(next, current)) return;
  current = next;
  for (const l of [...listeners]) l();
}

/**
 * Clear the hover, but only if it is still the one this caller set. A row's
 * pointer-leave can arrive *after* the next row's pointer-enter, and an
 * unconditional clear would then blank the highlight the viewer is looking
 * at.
 */
export function clearScenarioHover(owned: ScenarioHover): void {
  if (same(owned, current)) setScenarioHover(null);
}

/** Hovering a country on the map, from `countryFromPick` (null = not a country). */
export function setMapHoverCountry(iso3: string | null): void {
  setScenarioHover(iso3 === null ? null : { kind: "country", iso3 });
}

export function subscribeScenarioHover(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Server and hydration snapshot: nothing is hovered before the pointer moves. */
const serverSnapshot = (): ScenarioHover => null;

export function useScenarioHover(): ScenarioHover {
  return useSyncExternalStore(subscribeScenarioHover, getScenarioHover, serverSnapshot);
}

/** The hovered country's ISO3, or null when nothing (or an asset) is hovered. */
export function hoveredIso3(hover: ScenarioHover): string | null {
  return hover?.kind === "country" ? hover.iso3 : null;
}

/** The hovered asset's id, or null when nothing (or a country) is hovered. */
export function hoveredAssetId(hover: ScenarioHover): string | null {
  return hover?.kind === "asset" ? hover.assetId : null;
}

/** Test hook: forget what is hovered. */
export function resetScenarioHoverForTests(): void {
  current = null;
  listeners.clear();
}
