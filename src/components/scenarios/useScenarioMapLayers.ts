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
  SECOND_SCENARIO_SUFFIX,
  type DisruptionMarkDatum,
} from "./disruption-layers";
import { buildScenarioHoverLayers, type HoverableAsset } from "./hover-layers";
import { useScenarioHover } from "./hover";

export interface ScenarioMapLayersInput {
  /**
   * The active scenarios, primary first — empty when none is selected. T1:
   * a combined run draws *both* closures, because a map showing one of two
   * cuts while the panel quotes the pair would be a lie of omission.
   */
  readonly defs: readonly ScenarioDef[];
  readonly year: number;
  readonly commodity: Commodity;
  readonly assets: AssetsByKind | null;
}

export interface ScenarioMapLayers {
  /** Bottom to top: the hover highlight, then each scenario's disruption mark. */
  readonly layers: readonly Layer[];
  /** Every placed mark, for the camera fit (empty while none can be placed). */
  readonly marks: readonly DisruptionMarkDatum[];
  /** Visible scenario geometry still loading (counted into the page's pending). */
  readonly pending: number;
}

const NO_LAYERS: readonly Layer[] = [];
const NO_MARKS: readonly DisruptionMarkDatum[] = [];

export function useScenarioMapLayers({
  defs,
  year,
  commodity,
  assets,
}: ScenarioMapLayersInput): ScenarioMapLayers {
  const needsPipelines = defs.some((d) => d.pipelineIds !== undefined);
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
  const marks = useMemo(
    () =>
      defs.length === 0
        ? NO_MARKS
        : defs.flatMap((d) => {
            const m = disruptionMarkDatum(d, options);
            return m === null ? [] : [m];
          }),
    [defs, options],
  );
  const disruption = useMemo(
    () =>
      defs.length === 0
        ? NO_LAYERS
        : defs.flatMap((d, i) =>
            buildDisruptionLayers(d, options, i === 0 ? "" : SECOND_SCENARIO_SUFFIX),
          ),
    [defs, options],
  );
  const hoverLayers = useMemo(
    () =>
      defs.length === 0 ? NO_LAYERS : buildScenarioHoverLayers(hover, countries.data, hoverable),
    [defs, hover, countries.data, hoverable],
  );

  const layers = useMemo(() => [...hoverLayers, ...disruption], [hoverLayers, disruption]);
  return { layers, marks, pending: needsPipelines && !pipelines.ready ? 1 : 0 };
}
