import { CompositeLayer } from "@deck.gl/core";
import { GeoJsonLayer, type GeoJsonLayerProps } from "@deck.gl/layers";
import type { Feature, FeatureCollection, LineString, MultiLineString } from "geojson";
import { cachedLoader, fetchJson } from "@/lib/data/cache";
import { sourceLine } from "@/lib/data/sources";
import { isVisibleAtYear } from "@/lib/vintage/filter";
import {
  PIPELINE_HIT_WIDTH_PX,
  PIPELINE_LINE_MIN_PX,
  pipelineColor,
  type PipelineCommodity,
} from "@/lib/symbology";
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

interface PipelineLinesProps {
  readonly data: PipelineCollection;
  readonly commodity: PipelineCommodity;
}

/**
 * Visible 1.2 px lines plus a transparent 8 px pickable band underneath, so a
 * pipeline is hoverable at world zoom (D5). Transparent fragments still write
 * to deck.gl's picking buffer. Tooltips see the top-level layer id and the
 * GeoJSON feature, exactly as with a plain GeoJsonLayer.
 */
class PipelineLinesLayer extends CompositeLayer<PipelineLinesProps> {
  static override layerName = "PipelineLinesLayer";

  override renderLayers() {
    const { data, commodity } = this.props;
    return [
      new GeoJsonLayer<PipelineProps>(
        this.getSubLayerProps({
          id: "lines",
          data,
          stroked: true,
          filled: false,
          lineWidthMinPixels: PIPELINE_LINE_MIN_PX,
          getLineColor: (f: PipelineFeature) => [...pipelineColor(commodity, f.properties.status)],
          pickable: false,
          updateTriggers: { getLineColor: [commodity] },
        }) as GeoJsonLayerProps<PipelineProps>,
      ),
      new GeoJsonLayer<PipelineProps>(
        this.getSubLayerProps({
          id: "hit",
          data,
          stroked: true,
          filled: false,
          lineWidthUnits: "pixels",
          getLineWidth: PIPELINE_HIT_WIDTH_PX,
          lineWidthMinPixels: PIPELINE_HIT_WIDTH_PX,
          getLineColor: [0, 0, 0, 0],
          pickable: true,
        }) as GeoJsonLayerProps<PipelineProps>,
      ),
    ];
  }
}

/** Features of one pipeline commodity that existed by `year` (undated always show). */
export function filterPipelines(
  fc: PipelineCollection,
  commodity: PipelineCommodity,
  year: number,
): PipelineCollection {
  return {
    ...fc,
    features: fc.features.filter(
      (f) => f.properties.commodity === commodity && isVisibleAtYear(f.properties.start_year, year),
    ),
  };
}

export function buildPipelinesLayer(
  fc: PipelineCollection,
  commodity: PipelineCommodity,
  year: number,
): PipelineLinesLayer {
  return new PipelineLinesLayer({
    id: PIPELINE_LAYER_IDS[commodity],
    data: filterPipelines(fc, commodity, year),
    commodity,
    pickable: true,
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
