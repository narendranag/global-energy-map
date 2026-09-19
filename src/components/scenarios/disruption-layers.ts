/**
 * Where the scenario happens (S1).
 *
 * The exposure choropleth says which importers lose what; nothing said what
 * was cut, or where. These builders draw that: a closure glyph on a
 * chokepoint, and — for a pipeline scenario — the route's own features
 * redrawn on top as a cut line with a closure glyph on it.
 *
 * Two deliberate departures from the ordinary layer rules:
 *
 *  - the cut route ignores the **vintage filter**, and is drawn whether or
 *    not the oil-pipelines toggle is on. The route is the subject of the
 *    scenario, not one more piece of infrastructure the viewer chose to see;
 *    hiding it because the year slider sits before the pipeline's start year
 *    would hide the thing being explained.
 *  - it is drawn with a heavy white casing, because it must read over the
 *    dark exposure fills the same scenario paints.
 *
 * Pure builders (`buildDisruptionLayers(def, pipelines, opts)`), memoised by
 * `useScenarioMapLayers`; unit-tested in
 * `tests/unit/scenarios/disruption-layers.test.ts`.
 */
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { Feature, Geometry, Position } from "geojson";
import {
  DISRUPTION_CUT_CASING_PX,
  DISRUPTION_CUT_LINE_PX,
  DISRUPTION_FILL_COLOR,
  DISRUPTION_HALO_COLOR,
  DISRUPTION_MARK,
  disruptionColor,
} from "@/lib/symbology";
import { isScenarioActive, scenarioDescription, type ScenarioDef } from "@/lib/scenarios/registry";
import type { Commodity } from "@/lib/scenarios/types";
import type { PipelineCollection, PipelineProps } from "@/components/layers/PipelinesLayer";
import { joinLines } from "@/components/layers/tooltip";

/** Stable layer ids: the tooltip dispatch and the e2e probes key on them. */
export const DISRUPTION_MARK_LAYER_ID = "disruption-mark";
export const DISRUPTION_MARK_HALO_LAYER_ID = "disruption-mark-halo";
export const DISRUPTION_MARK_DOT_LAYER_ID = "disruption-mark-dot";
export const DISRUPTION_CUT_LAYER_ID = "disruption-cut";
export const DISRUPTION_CUT_CASING_LAYER_ID = "disruption-cut-casing";

/**
 * T1: the id suffix the *second* scenario of a combined run draws under. deck
 * requires unique layer ids, and the primary keeps the bare ids above so
 * every tooltip registration and e2e probe written against a single scenario
 * still finds exactly what it did.
 */
export const SECOND_SCENARIO_SUFFIX = "-2";

/** The one pickable object the mark layers carry. */
export interface DisruptionMarkDatum extends Record<string, unknown> {
  readonly lon: number;
  readonly lat: number;
  readonly label: string;
  readonly description: string;
  /** Set only when the year falls outside the scenario's `activeYears`. */
  readonly inactiveNote: string | null;
  readonly kind: ScenarioDef["kind"];
  readonly routeName: string;
}

// ---------------------------------------------------------------------------
// Geometry helpers (pure)
// ---------------------------------------------------------------------------

/**
 * The features that make up this scenario's route. Matched by `pipeline_id`
 * against `def.pipelineIds` — deliberately *not* filtered by year or by the
 * layer toggles (see the module note).
 */
export function cutFeatures(
  pipelines: PipelineCollection,
  ids: readonly string[],
): PipelineCollection {
  const wanted = new Set(ids);
  return {
    ...pipelines,
    features: pipelines.features.filter((f) => wanted.has(f.properties.pipeline_id)),
  };
}

function positionsOf(f: Feature<Geometry, PipelineProps>): Position[][] {
  const g = f.geometry;
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates;
  return [];
}

/** Planar length in degrees — a ranking device, never a distance. */
function pathLength(line: readonly Position[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (!a || !b) continue;
    total += Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0));
  }
  return total;
}

/**
 * A point on the route to hang the closure glyph on: the halfway point of the
 * longest single line in the set. "Longest" keeps the glyph on the trunk of a
 * multi-feature system (the Druzhba's 17 features include short spurs) rather
 * than on whichever fragment happened to come first, and halfway keeps it off
 * the endpoints, where it would look like a terminal rather than a cut.
 */
export function routeMidpoint(fc: PipelineCollection): { lon: number; lat: number } | null {
  let best: Position[] | null = null;
  let bestLength = -1;
  for (const f of fc.features) {
    for (const line of positionsOf(f)) {
      const length = pathLength(line);
      if (length > bestLength) {
        bestLength = length;
        best = line;
      }
    }
  }
  if (best === null || best.length === 0) return null;
  const half = pathLength(best) / 2;
  let walked = 0;
  for (let i = 1; i < best.length; i++) {
    const a = best[i - 1];
    const b = best[i];
    if (!a || !b) continue;
    const step = Math.hypot((b[0] ?? 0) - (a[0] ?? 0), (b[1] ?? 0) - (a[1] ?? 0));
    if (walked + step >= half && step > 0) {
      const t = (half - walked) / step;
      return {
        lon: (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
        lat: (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
      };
    }
    walked += step;
  }
  const last = best[best.length - 1];
  return last ? { lon: last[0] ?? 0, lat: last[1] ?? 0 } : null;
}

// ---------------------------------------------------------------------------
// The mark
// ---------------------------------------------------------------------------

export interface DisruptionOptions {
  readonly commodity: Commodity;
  readonly year: number;
  /** Null until `pipelines.geojson` has loaded (pipeline scenarios only). */
  readonly pipelines: PipelineCollection | null;
}

/**
 * The single mark datum for a scenario, or null when we cannot place one
 * (a pipeline scenario whose geometry has not loaded yet).
 */
export function disruptionMarkDatum(
  def: ScenarioDef,
  options: DisruptionOptions,
): DisruptionMarkDatum | null {
  const point =
    def.location ??
    (def.pipelineIds && options.pipelines
      ? routeMidpoint(cutFeatures(options.pipelines, def.pipelineIds))
      : null);
  if (point === null) return null;
  return {
    lon: point.lon,
    lat: point.lat,
    label: def.label,
    description: scenarioDescription(def, options.commodity),
    inactiveNote: isScenarioActive(def, options.year) ? null : def.inactiveNote ?? null,
    kind: def.kind,
    routeName: def.routeName,
  };
}

/**
 * Deck layers for the active scenario's disruption, bottom to top:
 * `[cut casing, cut line, mark halo, mark ring, mark dot]`. The caller
 * appends them above every data layer — this is the one thing on the map that
 * may cover anything else.
 *
 * Only the ring is pickable, so the glyph carries exactly one tooltip and the
 * country underneath stays selectable everywhere else.
 */
export function buildDisruptionLayers(
  def: ScenarioDef,
  options: DisruptionOptions,
  /** `SECOND_SCENARIO_SUFFIX` for the second scenario of a combined run. */
  idSuffix = "",
): Layer[] {
  const id = (base: string) => `${base}${idSuffix}`;
  const active = isScenarioActive(def, options.year);
  const color = [...disruptionColor(active)] as [number, number, number, number];
  const layers: Layer[] = [];

  if (def.pipelineIds !== undefined && options.pipelines !== null) {
    const data = cutFeatures(options.pipelines, def.pipelineIds);
    const common = { data, stroked: true, filled: false, pickable: false } as const;
    layers.push(
      new GeoJsonLayer<PipelineProps>({
        ...common,
        id: id(DISRUPTION_CUT_CASING_LAYER_ID),
        getLineColor: [...DISRUPTION_HALO_COLOR],
        lineWidthMinPixels: DISRUPTION_CUT_CASING_PX,
        lineWidthMaxPixels: DISRUPTION_CUT_CASING_PX,
      }),
      new GeoJsonLayer<PipelineProps>({
        ...common,
        id: id(DISRUPTION_CUT_LAYER_ID),
        getLineColor: color,
        lineWidthMinPixels: DISRUPTION_CUT_LINE_PX,
        lineWidthMaxPixels: DISRUPTION_CUT_LINE_PX,
        updateTriggers: { getLineColor: [active] },
      }),
    );
  }

  const mark = disruptionMarkDatum(def, options);
  if (mark === null) return layers;

  const data = [mark];
  const position = (d: DisruptionMarkDatum): [number, number] => [d.lon, d.lat];
  const pixels = { radiusUnits: "pixels", lineWidthUnits: "pixels" } as const;
  layers.push(
    // White disc: the glyph must read over water and over a dark exposure fill.
    new ScatterplotLayer<DisruptionMarkDatum>({
      ...pixels,
      id: id(DISRUPTION_MARK_HALO_LAYER_ID),
      data,
      getPosition: position,
      getRadius: DISRUPTION_MARK.haloRadiusPx,
      getFillColor: [...DISRUPTION_HALO_COLOR],
      pickable: false,
    }),
    new ScatterplotLayer<DisruptionMarkDatum>({
      ...pixels,
      id: id(DISRUPTION_MARK_LAYER_ID),
      data,
      getPosition: position,
      getRadius: DISRUPTION_MARK.ringRadiusPx,
      stroked: true,
      filled: true,
      getFillColor: [...DISRUPTION_FILL_COLOR],
      getLineColor: color,
      getLineWidth: DISRUPTION_MARK.ringWidthPx,
      pickable: true,
      updateTriggers: { getLineColor: [active] },
    }),
    new ScatterplotLayer<DisruptionMarkDatum>({
      ...pixels,
      id: id(DISRUPTION_MARK_DOT_LAYER_ID),
      data,
      getPosition: position,
      getRadius: DISRUPTION_MARK.dotRadiusPx,
      getFillColor: color,
      pickable: false,
      updateTriggers: { getFillColor: [active] },
    }),
  );
  return layers;
}

/** Tooltip for the closure glyph: what is closed, and (if any) why not here. */
export function formatDisruptionTooltip(d: DisruptionMarkDatum): string {
  return joinLines(
    `Scenario: ${d.label}`,
    d.kind === "pipeline" ? `Route cut: ${d.routeName}` : `Chokepoint closed: ${d.routeName}`,
    d.description,
    d.inactiveNote !== null && `Not modelled in this year: ${d.inactiveNote}`,
  );
}
