"use client";
import { useSyncExternalStore } from "react";
import { useMapView } from "@/lib/state";
import { encodeUrlState, type AppState } from "@/lib/url-state/encode";

const noopSubscribe = () => () => undefined;

/**
 * False during SSR and the first client render (which must match the server
 * to avoid a hydration mismatch), true from the next render on. A plain
 * `typeof window !== "undefined"` check in the render body never gets a
 * second look once that first client render commits — nothing re-renders
 * this component afterwards — so a value gated on it alone would stay stuck
 * at its SSR fallback forever. `useSyncExternalStore`'s client/server snapshot
 * split forces the one extra render this needs, without `setState` in an effect.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Replaces the header, intro card, phone banner and `MapFooter` in `?embed=1`
 * (S7): one compact bar that keeps every attribution the licences require
 * visible (GEM, LNG-T3, NETL, EI, BACI, OSM — the MapLibre attribution
 * control itself is unaffected by embed mode and stays on the map), names the
 * site, and links out to the same view with `embed`/`controls` dropped —
 * never added, since `encodeUrlState` only ever knows `AppState` + `MapView`.
 */
export function EmbedAttributionBar({ state }: { readonly state: AppState }) {
  const view = useMapView();
  const hydrated = useHydrated();
  const fullMapUrl = hydrated
    ? `${window.location.origin}${window.location.pathname}?${encodeUrlState(state, view)}`
    : "/";

  return (
    <div
      data-testid="embed-attribution"
      className="pointer-events-auto absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded bg-white/90 px-2 py-1 text-[11px] leading-snug text-slate-700 shadow-sm backdrop-blur"
    >
      <span className="shrink-0 font-semibold text-slate-900">Global Energy Map</span>
      <span className="min-w-0 flex-1">
        Data: Global Energy Monitor (CC BY 4.0) · LNG-T3, C. Zhou 2026 (CC BY 4.0) · NETL (US DOE) · Energy
        Institute Statistical Review · CEPII BACI · © OpenStreetMap contributors (ODbL) · Basemap © OpenFreeMap
        / OpenMapTiles.
      </span>
      <a
        href={fullMapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 whitespace-nowrap font-medium text-sky-800 underline underline-offset-2 hover:text-sky-950"
      >
        Open full map ↗
      </a>
    </div>
  );
}
