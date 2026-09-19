/**
 * The map half of the panel ↔ map link (S1): what a hovered ranked row draws.
 *
 * Countries get a wash plus a thin edge (see `HOVER_*` in symbology — not a
 * second outline colour, so it cannot be confused with the S0 selection);
 * refineries and LNG terminals get a ring around the asset. Nothing here is
 * pickable: a highlight is a response to pointing, and must never become a
 * hit target of its own.
 *
 * Pure builders, unit-tested in `tests/unit/scenarios/hover-layers.test.ts`.
 */
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { CountryCollection, CountryProps } from "@/lib/geo/countries";
import {
  HOVER_FILL,
  HOVER_OUTLINE_COLOR,
  HOVER_OUTLINE_MIN_PX,
  HOVER_RING_RADIUS_PX,
  HOVER_RING_WIDTH_PX,
} from "@/lib/symbology";
import { hoveredAssetId, hoveredIso3, type ScenarioHover } from "./hover";

export const HOVER_COUNTRY_LAYER_ID = "scenario-hover-country";
export const HOVER_ASSET_LAYER_ID = "scenario-hover-asset";

/** The minimum an asset row needs for its ring to be drawn. */
export interface HoverableAsset {
  readonly asset_id: string;
  readonly lon: number;
  readonly lat: number;
}

interface HoverRing extends Record<string, unknown> {
  readonly lon: number;
  readonly lat: number;
}

/**
 * Layers for the current hover, or `[]` when nothing is pointed at. The
 * caller splices them in above the fills and below the disruption mark: a
 * highlight frames the ground, it does not cover the thing that explains it.
 */
export function buildScenarioHoverLayers(
  hover: ScenarioHover,
  countries: CountryCollection | null,
  assets: readonly HoverableAsset[] | null,
): Layer[] {
  const iso3 = hoveredIso3(hover);
  if (iso3 !== null && countries !== null) {
    const features = countries.features.filter((f) => f.properties.iso3 === iso3);
    if (features.length === 0) return [];
    return [
      new GeoJsonLayer<CountryProps>({
        id: HOVER_COUNTRY_LAYER_ID,
        data: { type: "FeatureCollection", features },
        filled: true,
        stroked: true,
        getFillColor: [...HOVER_FILL],
        getLineColor: [...HOVER_OUTLINE_COLOR],
        lineWidthMinPixels: HOVER_OUTLINE_MIN_PX,
        lineWidthMaxPixels: HOVER_OUTLINE_MIN_PX,
        pickable: false,
      }),
    ];
  }

  const assetId = hoveredAssetId(hover);
  if (assetId === null || assets === null) return [];
  const asset = assets.find((a) => a.asset_id === assetId);
  if (asset === undefined) return [];
  return [
    new ScatterplotLayer<HoverRing>({
      id: HOVER_ASSET_LAYER_ID,
      data: [{ lon: asset.lon, lat: asset.lat }],
      getPosition: (d: HoverRing) => [d.lon, d.lat],
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      getRadius: HOVER_RING_RADIUS_PX,
      stroked: true,
      filled: false,
      getLineColor: [...HOVER_OUTLINE_COLOR],
      getLineWidth: HOVER_RING_WIDTH_PX,
      pickable: false,
    }),
  ];
}
