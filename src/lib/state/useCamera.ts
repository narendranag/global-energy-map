"use client";
import { useMemo } from "react";
import { countryBounds } from "@/lib/geo/bounds";
import { countryAnchor } from "@/lib/geo/country-anchors";
import { FIT_MAX_ZOOM, type CameraPadding, type CameraRequest } from "./camera";
import { peekAppStore } from "./store";

export interface Camera {
  /** Post a camera command. A no-op on the server / before the store exists. */
  readonly request: (command: CameraRequest) => void;
  /**
   * Fit the map to a country's bounds, or — for a focusable country with no
   * 1:110m polygon — fly to its anchor (B1). Resolves false only when `iso3`
   * has neither, in which case nothing moves. Async because
   * `countries.geojson` is fetched —
   * the load is the shared cached one, so this costs nothing after first use.
   */
  readonly fitCountry: (
    iso3: string,
    options?: { padding?: Partial<CameraPadding>; maxZoom?: number },
  ) => Promise<boolean>;
}

function request(command: CameraRequest): void {
  peekAppStore()?.requestCamera(command);
}

async function fitCountry(
  iso3: string,
  options?: { padding?: Partial<CameraPadding>; maxZoom?: number },
): Promise<boolean> {
  const bounds = await countryBounds(iso3);
  if (bounds === null) {
    // No 1:110m polygon (Singapore, Bahrain, Hong Kong, …) but a real
    // selection all the same (B1): fly to the country anchor at the same zoom
    // a fit would have stopped at, rather than leaving "Zoom to" a no-op.
    const anchor = countryAnchor(iso3);
    if (anchor === undefined) return false;
    request({ kind: "flyTo", lon: anchor[0], lat: anchor[1], zoom: options?.maxZoom ?? FIT_MAX_ZOOM });
    return true;
  }
  request({
    kind: "fitBounds",
    bounds,
    ...(options?.padding !== undefined ? { padding: options.padding } : {}),
    ...(options?.maxZoom !== undefined ? { maxZoom: options.maxZoom } : {}),
  });
  return true;
}

/**
 * The camera seam for components: move the map without holding a map handle.
 * Commands go through the app store (`requestCamera`) and are executed by
 * MapShell, which honours `prefers-reduced-motion`.
 */
export function useCamera(): Camera {
  return useMemo(() => ({ request, fitCountry }), []);
}
