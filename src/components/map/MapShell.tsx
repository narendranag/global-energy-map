"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import "maplibre-gl/dist/maplibre-gl.css";
import { basemapStyle, fallbackStyle, firstSymbolLayerId } from "./style";
import { peekAppStore } from "@/lib/state/store";
import {
  FIT_MAX_ZOOM,
  paddingOffset,
  prefersReducedMotion,
  resolvePadding,
  type CameraPadding,
  type CameraRequest,
} from "@/lib/state/camera";
import { DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM } from "@/lib/state/view";

export interface MapShellProps {
  readonly layers: readonly Layer[];
  readonly getTooltip?: (info: PickingInfo) => string | null;
  /**
   * A click anywhere on the map. deck reports the topmost picked object;
   * `info.layer === null` means nothing was hit (empty sea). The caller
   * decides what a pick means — MapShell knows nothing about focus.
   */
  readonly onPick?: (info: PickingInfo) => void;
}

/**
 * Hover tolerance in CSS px. Deck-level (not per layer), so thin pipeline
 * lines stay pickable at low zoom.
 */
const PICKING_RADIUS = 4;

/** Accessible name of the map canvas (MapLibre's keyboard handler: arrows pan, +/− zoom). */
export const MAP_LABEL = "Map — arrow keys pan, plus and minus zoom";

/** How long a camera command takes when motion is allowed. */
const CAMERA_DURATION_MS = 900;

/**
 * Padding must leave room to actually fit something: MapLibre cannot honour a
 * left+right padding wider than the map. Oversized padding is scaled down
 * proportionally rather than dropped, so a fit stays as clear of the panels as
 * the viewport allows (a phone gets almost none; a desktop gets all of it).
 */
function fitPadding(padding: CameraPadding, width: number, height: number): CameraPadding {
  const shrink = (a: number, b: number, extent: number) => {
    const room = extent * 0.8;
    const total = a + b;
    return total <= room || total === 0 ? ([a, b] as const) : ([(a / total) * room, (b / total) * room] as const);
  };
  const [left, right] = shrink(padding.left, padding.right, width);
  const [top, bottom] = shrink(padding.top, padding.bottom, height);
  return { left, right, top, bottom };
}

/** Run one camera command against the map, honouring `prefers-reduced-motion`. */
function applyCamera(map: maplibregl.Map, command: CameraRequest): void {
  const duration = prefersReducedMotion() ? 0 : CAMERA_DURATION_MS;
  const canvas = map.getCanvas();
  if (command.kind === "flyTo") {
    const target = {
      center: [command.lon, command.lat] as [number, number],
      ...(command.zoom === undefined ? {} : { zoom: command.zoom }),
      // Panel-aware, as a one-shot offset: MapLibre's camera `padding` would
      // stick to the map and skew every later interaction (finding 14).
      ...(command.padding === undefined
        ? {}
        : {
            offset: paddingOffset(
              fitPadding(resolvePadding(command.padding), canvas.clientWidth, canvas.clientHeight),
              canvas.clientWidth,
              canvas.clientHeight,
            ),
          }),
    };
    if (duration === 0) map.jumpTo(target);
    else map.flyTo({ ...target, duration });
    return;
  }
  const [west, south, east, north] = command.bounds;
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: fitPadding(
        resolvePadding(command.padding),
        canvas.clientWidth,
        canvas.clientHeight,
      ),
      maxZoom: command.maxZoom ?? FIT_MAX_ZOOM,
      duration,
    },
  );
}

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
export function MapShell({ layers, getTooltip, onPick }: MapShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  // The click handler is read through a ref so the map is built once: `onPick`
  // changes identity whenever the caller's state does.
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
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

    // Clicks come from MapLibre, not from deck — by choice, not by necessity.
    //
    // Deck's own `onClick` *does* fire under `MapboxOverlay({interleaved:
    // true})`: Deck binds its EventManager to MapLibre's canvas, which is the
    // same path that makes hover work. (An earlier comment here blamed a
    // missing event wiring; that diagnosis was wrong.) We keep the MapLibre
    // path anyway because it gives one click path rather than two, MapLibre's
    // own drag tolerance (a pan that ends on a country must not select it),
    // and — the part deck cannot give us — a click that hits nothing at all,
    // which the caller reads as "clicked the sea" and uses to clear the
    // selection. `onClick` is left unset on the overlay, so nothing fires twice.
    //
    // So we do the two things `onClick` would have done: pick at the click
    // point, and report a miss as `layer: null`.
    map.on("click", (e) => {
      const handler = onPickRef.current;
      if (!handler) return;
      let picked: PickingInfo | null = null;
      try {
        picked = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: PICKING_RADIUS });
      } catch {
        // Deck's picker is not ready (a click during the first frame, or
        // mid-teardown). A failed pick is a miss, not an app error — it used
        // to reach the global error panel and replace the map (B5).
        picked = null;
      }
      handler(
        picked ??
          ({
            layer: null,
            object: null,
            picked: false,
            index: -1,
            x: e.point.x,
            y: e.point.y,
            coordinate: [e.lngLat.lng, e.lngLat.lat],
          } as unknown as PickingInfo),
      );
    });

    // The camera seam: anything in the app can ask the map to move without
    // holding this handle (`useCamera` → store.requestCamera). A request
    // posted before this subscription — `?focus=JPN` fitting on load — is
    // held by the store and delivered here.
    const unsubscribeCamera = peekAppStore()?.subscribeCamera((command) => {
      if (map.isStyleLoaded() || map.loaded()) applyCamera(map, command);
      else void map.once("load", () => { applyCamera(map, command); });
    });

    return () => {
      unsubscribeCamera?.();
      overlayRef.current = null;
      map.remove(); // removes the overlay control and finalizes its Deck
    };
  }, []);

  useEffect(() => {
    overlayRef.current?.setProps({
      layers: labelAnchor ? anchorBeneathLabels(layers, labelAnchor.beforeId) : [],
      // exactOptionalPropertyTypes: use null (not undefined) to satisfy DeckProps.getTooltip type
      getTooltip: getTooltip ? makeDeckTooltip(getTooltip) : null,
      // `onClick` is deliberately not set: in interleaved mode deck never
      // fires it (see the `map.on("click")` handler above, which is the only
      // click path). Setting it as well would double-handle the day deck
      // changes that.
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
