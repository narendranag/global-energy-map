"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Deck } from "@deck.gl/core";
import type { Layer, PickingInfo, MapViewState } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapStyle } from "./style";

export interface MapShellProps {
  readonly layers: readonly Layer[];
  readonly getTooltip?: (info: PickingInfo) => string | null;
}

/**
 * Shared zoom bounds for MapLibre and deck.gl. The data layers (simplified
 * pipelines, 1:110m countries) stop being useful past z8, and MapLibre clamps
 * `jumpTo` at `maxZoom`, so deck.gl must be clamped to the same range or its
 * layers drift off the basemap (R12).
 */
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 8;

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: 40,
  latitude: 25,
  zoom: 2,
  pitch: 0,
  bearing: 0,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
};

/** Clamp a deck.gl view state's zoom into [MIN_ZOOM, MAX_ZOOM]. */
function clampViewState<T extends MapViewState>(viewState: T): T {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewState.zoom));
  return zoom === viewState.zoom ? viewState : { ...viewState, zoom };
}

/** Wraps a user-supplied tooltip getter into the TooltipContent shape deck.gl expects. */
function makeDeckTooltip(
  getTooltip: (info: PickingInfo) => string | null,
): (info: PickingInfo) => { text: string } | null {
  return (info: PickingInfo) => {
    const text = getTooltip(info);
    return text ? { text } : null;
  };
}

export function MapShell({ layers, getTooltip }: MapShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<Deck | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle,
      center: [INITIAL_VIEW_STATE.longitude, INITIAL_VIEW_STATE.latitude],
      zoom: INITIAL_VIEW_STATE.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      // Always show the full text (OpenStreetMap / OpenMapTiles require visible
      // attribution); the default collapses to an "i" button under 640 px.
      attributionControl: { compact: false },
    });
    mapRef.current = map;

    // Spread into a mutable array: DeckProps.layers expects LayersList (mutable), not readonly
    const mutableLayers: Layer[] = [...layers];

    const deck = new Deck({
      canvas: "deck-canvas",
      width: "100%",
      height: "100%",
      initialViewState: INITIAL_VIEW_STATE,
      controller: true,
      onViewStateChange: <T extends MapViewState>({ viewState }: { viewState: T }): T => {
        // Returning the clamped state makes deck.gl adopt it (uncontrolled
        // initialViewState mode), keeping both renderers on the same zoom.
        const clamped = clampViewState(viewState);
        map.jumpTo({
          center: [clamped.longitude, clamped.latitude],
          zoom: clamped.zoom,
          bearing: clamped.bearing ?? 0,
          pitch: clamped.pitch ?? 0,
        });
        return clamped;
      },
      layers: mutableLayers,
      // exactOptionalPropertyTypes: use null (not undefined) to satisfy DeckProps.getTooltip type
      getTooltip: getTooltip ? makeDeckTooltip(getTooltip) : null,
    });
    deckRef.current = deck;

    return () => {
      deck.finalize();
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only effect; layers/getTooltip synced via second effect
  }, []);

  useEffect(() => {
    // Spread into a mutable array: DeckProps.layers expects LayersList (mutable), not readonly
    const mutableLayers: Layer[] = [...layers];
    deckRef.current?.setProps({
      layers: mutableLayers,
      // exactOptionalPropertyTypes: use null (not undefined) to satisfy DeckProps.getTooltip type
      getTooltip: getTooltip ? makeDeckTooltip(getTooltip) : null,
    });
  }, [layers, getTooltip]);

  return (
    <div className="relative h-full w-full">
      {/*
        Sizing is inline on purpose. maplibre-gl.css sets
        `.maplibregl-map { position: relative }` as an *unlayered* rule, and
        unlayered CSS beats everything in Tailwind v4's `@layer utilities`
        regardless of specificity or order — so a Tailwind `absolute inset-0`
        here loses, the container collapses to 0 px tall, and the basemap is
        invisible (R9). Inline styles win over both.
      */}
      <div
        ref={containerRef}
        data-testid="basemap"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <canvas id="deck-canvas" className="pointer-events-auto absolute inset-0" />
    </div>
  );
}
