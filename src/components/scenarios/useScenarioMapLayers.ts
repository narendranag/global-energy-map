"use client";
/**
 * The scenario's own deck layers (S1), kept out of `useMapLayers` on purpose:
 * they are not layer-toggle layers. They exist because a scenario is active,
 * they ignore the year filter, and they draw above everything else. The page
 * appends them to the layer stack.
 *
 * `pipelines.geojson` (8 MB) is fetched here only when a *pipeline* scenario
 * is active and the oil/gas pipeline toggles have not already fetched it —
 * it is the same module-cached loader either way, so at most one request —
 * and the wait is counted in `pending`, so `data-ready` does not go true with
 * the cut route missing.
 */
import { useMemo } from "react";
import type { Layer } from "@deck.gl/core";
import type { AssetsByKind } from "@/lib/data/assets";
import { useAsync } from "@/lib/data/useAsync";
import { loadCountries } from "@/lib/geo/countries";
import type { ScenarioDef } from "@/lib/scenarios/registry";
import type { Commodity } from "@/lib/scenarios/types";
import { loadPipelines } from "@/components/layers/PipelinesLayer";
import {
  buildDisruptionLayers,
  disruptionMarkDatum,
  type DisruptionMarkDatum,
} from "./disruption-layers";
import { buildScenarioHoverLayers, type HoverableAsset } from "./hover-layers";
import { useScenarioHover } from "./hover";

export interface ScenarioMapLayersInput {
  /** The active scenario, or null when none is selected. */
  readonly def: ScenarioDef | null;
  readonly year: number;
  readonly commodity: Commodity;
  readonly assets: AssetsByKind | null;
}

export interface ScenarioMapLayers {
  /** Bottom to top: the hover highlight, then the disruption mark. */
  readonly layers: readonly Layer[];
  /** The mark's datum, for the camera fit; null while it cannot be placed. */
  readonly mark: DisruptionMarkDatum | null;
  /** Visible scenario geometry still loading (counted into the page's pending). */
  readonly pending: number;
}

const NO_LAYERS: readonly Layer[] = [];

export function useScenarioMapLayers({
  def,
  year,
  commodity,
  assets,
}: ScenarioMapLayersInput): ScenarioMapLayers {
  const needsPipelines = def?.pipelineIds !== undefined;
  const pipelines = useAsync(loadPipelines, needsPipelines ? [] : null);
  // Always loaded by the map itself; this is the same cached promise.
  const countries = useAsync(loadCountries, []);
  const hover = useScenarioHover();

  // Only the asset kinds a ranked row can name can be hovered or flown to.
  const hoverable = useMemo<HoverableAsset[] | null>(
    () =>
      assets === null
        ? null
        : [...assets.refinery, ...assets.lngImport, ...assets.lngExport].map((a) => ({
            asset_id: a.asset_id,
            lon: a.lon,
            lat: a.lat,
          })),
    [assets],
  );

  const options = useMemo(
    () => ({ commodity, year, pipelines: pipelines.data }),
    [commodity, year, pipelines.data],
  );
  const mark = useMemo(
    () => (def === null ? null : disruptionMarkDatum(def, options)),
    [def, options],
  );
  const disruption = useMemo(
    () => (def === null ? NO_LAYERS : buildDisruptionLayers(def, options)),
    [def, options],
  );
  const hoverLayers = useMemo(
    () =>
      def === null ? NO_LAYERS : buildScenarioHoverLayers(hover, countries.data, hoverable),
    [def, hover, countries.data, hoverable],
  );

  const layers = useMemo(() => [...hoverLayers, ...disruption], [hoverLayers, disruption]);
  return { layers, mark, pending: needsPipelines && !pipelines.ready ? 1 : 0 };
}
