"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapStyle, fallbackStyle, firstSymbolLayerId } from "./style";
import { peekAppStore } from "@/lib/state/store";
import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM } from "@/lib/state/view";

export interface MapShellProps {
  readonly layers: readonly Layer[];
  readonly getTooltip?: (info: PickingInfo) => string | null;
}

/**
 * Hover tolerance in CSS px. Deck-level (not per layer), so thin pipeline
 * lines stay pickable at low zoom.
 */
const PICKING_RADIUS = 4;

/** Accessible name of the map canvas (MapLibre's keyboard handler: arrows pan, +/− zoom). */
export const MAP_LABEL = "Map — arrow keys pan, plus and minus zoom";

/** Where deck layers go in the MapLibre layer stack, once the style is loaded. */
interface LabelAnchor {
  /** First label layer; `undefined` when the style has none (deck draws on top). */
  readonly beforeId: string | undefined;
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

/**
 * Give every layer a `beforeId` (MapboxOverlay interleaved mode) so it is drawn
 * beneath the basemap's labels. A layer that already sets one keeps it.
 */
function anchorBeneathLabels(layers: readonly Layer[], beforeId: string | undefined): Layer[] {
  if (beforeId === undefined) return [...layers];
  return layers.map((layer) => {
    const props = layer.props as { beforeId?: string };
    if (props.beforeId !== undefined) return layer;
    // `beforeId` is a MapboxOverlay layer prop that deck's Layer typings don't declare.
    return layer.clone({ beforeId } as Partial<Layer["props"]>) as Layer;
  });
}

/**
 * MapLibre owns the canvas and the camera; deck.gl renders *into* MapLibre's
 * WebGL2 context through `MapboxOverlay({ interleaved: true })`. One canvas,
 * one camera, one set of zoom limits — no view-state sync to drift (R12, R23).
 */
export function MapShell({ layers, getTooltip }: MapShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  // null until the style has loaded: deck layers can only be inserted into a
  // loaded style, and must know which label layer to sit beneath.
  const [labelAnchor, setLabelAnchor] = useState<LabelAnchor | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initial = peekAppStore()?.getView() ?? DEFAULT_VIEW;
    const map = new maplibregl.Map({
      container,
      style: basemapStyle,
      center: [initial.lon, initial.lat],
      zoom: initial.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      // A flat analytical map: the shareable view is lon/lat/zoom only.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // Always show the full text (OpenStreetMap / OpenMapTiles require visible
      // attribution); the default collapses to an "i" button under 640 px.
      attributionControl: { compact: false },
      // The canvas is the map's focus target (role="region"); its name is
      // the only hint that the map is keyboard-operable.
      locale: { "Map.Title": MAP_LABEL },
    });
    map.touchZoomRotate.disableRotation();

    // Interleaved deck layers live inside the MapLibre style, so if the
    // basemap style itself cannot be fetched, swap in a bare one rather than
    // losing the data layers too.
    let styleLoaded = false;
    let fellBack = false;
    map.on("error", () => {
      if (styleLoaded || fellBack) return;
      fellBack = true;
      map.setStyle(fallbackStyle);
    });
    map.on("style.load", () => {
      styleLoaded = true;
      setLabelAnchor({ beforeId: firstSymbolLayerId(map.getStyle().layers) });
    });

    map.on("moveend", () => {
      const center = map.getCenter();
      peekAppStore()?.setView({ lon: center.lng, lat: center.lat, zoom: map.getZoom() });
    });

    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
      pickingRadius: PICKING_RADIUS,
    });
    map.addControl(overlay);
    overlayRef.current = overlay;

    return () => {
      overlayRef.current = null;
      map.remove(); // removes the overlay control and finalizes its Deck
    };
  }, []);

  useEffect(() => {
    overlayRef.current?.setProps({
      layers: labelAnchor ? anchorBeneathLabels(layers, labelAnchor.beforeId) : [],
      // exactOptionalPropertyTypes: use null (not undefined) to satisfy DeckProps.getTooltip type
      getTooltip: getTooltip ? makeDeckTooltip(getTooltip) : null,
    });
  }, [layers, getTooltip, labelAnchor]);

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
    </div>
  );
}
