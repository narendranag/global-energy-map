"use client";
/**
 * Lazily builds the search index: nothing here fetches on page load
 * (`tests/e2e/network.spec.ts` guards the cold-load request set). The first
 * time `enabled` turns true — a focus or a keystroke in the search box — it
 * awaits the already-module-cached loaders for countries, assets, pipelines,
 * basins and shale regions, which may not have been requested yet if their
 * layers are off. Every one of those loaders is a `cachedLoader`, so a
 * layer that is already on pays nothing twice.
 */
import { useEffect, useRef, useState } from "react";
import { loadBasins } from "@/components/layers/BasinPolygonsLayer";
import { loadPipelines } from "@/components/layers/PipelinesLayer";
import { loadAssets } from "@/lib/data/assets";
import { loadShaleRegionShapes } from "@/lib/data/shale-regions";
import { loadCountries } from "@/lib/geo/countries";
import { reportError } from "@/components/errors/report";
import { buildSearchItems } from "./build";
import type { SearchItem } from "./types";

let cached: Promise<readonly SearchItem[]> | null = null;

function loadSearchIndex(): Promise<readonly SearchItem[]> {
  cached ??= Promise.all([
    loadCountries(),
    loadAssets(),
    loadPipelines(),
    loadBasins(),
    loadShaleRegionShapes(),
  ])
    .then(([countries, assets, pipelines, basins, shaleRegions]) =>
      buildSearchItems({ countries, assets, pipelines, basins, shaleRegions }),
    )
    .catch((err: unknown) => {
      cached = null;
      throw err;
    });
  return cached;
}

export interface SearchIndexState {
  /** null until the index has been built for this `enabled` run. */
  readonly items: readonly SearchItem[] | null;
  readonly loading: boolean;
}

/** Starts the (module-cached) build the first time `enabled` is true; never before. */
export function useSearchIndex(enabled: boolean): SearchIndexState {
  const [items, setItems] = useState<readonly SearchItem[] | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    const ctrl = { cancelled: false };
    loadSearchIndex().then(
      (idx) => {
        if (!ctrl.cancelled) setItems(idx);
      },
      (err: unknown) => {
        if (!ctrl.cancelled) reportError(err, "search index load failed");
      },
    );
    return () => {
      ctrl.cancelled = true;
    };
  }, [enabled]);

  return { items, loading: enabled && items === null };
}

/** Test hook: forget the module-level cache between specs. */
export function resetSearchIndexForTests(): void {
  cached = null;
}
