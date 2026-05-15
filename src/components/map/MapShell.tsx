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

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: 40,
  latitude: 25,
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

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
      maxZoom: 8,
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
      onViewStateChange: ({ viewState }: { viewState: MapViewState }) => {
        map.jumpTo({
          center: [viewState.longitude, viewState.latitude],
          zoom: viewState.zoom,
          bearing: viewState.bearing ?? 0,
          pitch: viewState.pitch ?? 0,
        });
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
      <div ref={containerRef} className="absolute inset-0" />
      <canvas id="deck-canvas" className="pointer-events-auto absolute inset-0" />
    </div>
  );
}
