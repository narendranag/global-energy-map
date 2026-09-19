"use client";
import { useMemo } from "react";
import { countryBounds } from "@/lib/geo/bounds";
import type { CameraPadding, CameraRequest } from "./camera";
import { peekAppStore } from "./store";

export interface Camera {
  /** Post a camera command. A no-op on the server / before the store exists. */
  readonly request: (command: CameraRequest) => void;
  /**
   * Fit the map to a country's bounds. Resolves false when we hold no polygon
   * for `iso3` (nothing moves). Async because `countries.geojson` is fetched —
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
  if (bounds === null) return false;
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
