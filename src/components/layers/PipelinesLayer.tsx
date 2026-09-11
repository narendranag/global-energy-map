import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, Geometry, LineString, MultiLineString } from "geojson";
import { cachedLoader, fetchJson } from "@/lib/data/cache";
import { sourceLine } from "@/lib/data/sources";
import { isVisibleAtYear } from "@/lib/vintage/filter";
import { PIPELINE_LINE_MIN_PX, pipelineColor, type PipelineCommodity } from "@/lib/symbology";
import { formatCapacity, joinLines, orNa, type TooltipFormatter } from "./tooltip";

export const PIPELINE_LAYER_IDS: Record<PipelineCommodity, string> = {
  crude: "pipelines-crude",
  gas: "pipelines-gas",
};

export interface PipelineProps extends Record<string, unknown> {
  pipeline_id: string;
  name: string;
  status: string;
  commodity: string;
  /** In `capacity_unit` (kbpd for oil, bcm/y for gas) despite the column name. */
  capacity_kbpd: number | null;
  capacity_unit?: string | null;
  operator: string | null;
  start_year: number | null;
}

export type PipelineFeature = Feature<LineString | MultiLineString, PipelineProps>;
export type PipelineCollection = FeatureCollection<LineString | MultiLineString, PipelineProps>;

/**
 * pipelines.geojson sidecar (build_pipelines.py), shared by the oil and gas
 * layers: one fetch, filtered per layer in memory.
 */
export const loadPipelines = cachedLoader(() =>
  fetchJson<PipelineCollection>("/data/pipelines.geojson"),
);

/** Which map layer a GEM pipeline commodity belongs to: NGL lines are oil-sector infrastructure. */
export function pipelineLayerGroup(featureCommodity: string): PipelineCommodity {
  return featureCommodity === "gas" ? "gas" : "crude";
}

/** Features of one pipeline layer group that existed by `year` (undated always show). */
export function filterPipelines(
  fc: PipelineCollection,
  commodity: PipelineCommodity,
  year: number,
): PipelineCollection {
  return {
    ...fc,
    features: fc.features.filter(
      (f) => pipelineLayerGroup(f.properties.commodity) === commodity && isVisibleAtYear(f.properties.start_year, year),
    ),
  };
}

/**
 * Thin (1.25 px) lines. Hover tolerance comes from the overlay's
 * `pickingRadius` (MapShell), which keeps them pickable at world zoom (D5).
 * An extra transparent 8 px hit band used to sit underneath: under software
 * WebGL it doubled the gas layer's frame time (every GGIT path drawn twice)
 * and added nothing the picking radius does not already give.
 */
export function buildPipelinesLayer(
  fc: PipelineCollection,
  commodity: PipelineCommodity,
  year: number,
): GeoJsonLayer<PipelineProps> {
  return new GeoJsonLayer<PipelineProps>({
    id: PIPELINE_LAYER_IDS[commodity],
    data: filterPipelines(fc, commodity, year),
    stroked: true,
    filled: false,
    lineWidthMinPixels: PIPELINE_LINE_MIN_PX,
    // GeoJsonLayer types its accessors over any Geometry; only lines reach it.
    getLineColor: (f: Feature<Geometry, PipelineProps>) => [...pipelineColor(commodity, f.properties.status)],
    pickable: true,
    updateTriggers: { getLineColor: [commodity] },
  });
}

export const formatPipelineTooltip: TooltipFormatter<PipelineFeature> = (f) => {
  const p = f.properties;
  const isGas = p.commodity === "gas";
  return joinLines(
    `Pipeline: ${p.name}`,
    `Commodity: ${p.commodity}`,
    `Status: ${orNa(p.status)}`,
    `Operator: ${orNa(p.operator)}`,
    `Capacity: ${formatCapacity(p.capacity_kbpd, p.capacity_unit ?? (isGas ? "bcm/y" : "kbpd"))}`,
    p.start_year !== null && `Start year: ${p.start_year.toString()}`,
    sourceLine(isGas ? "gas_pipelines" : "pipelines"),
  );
};
