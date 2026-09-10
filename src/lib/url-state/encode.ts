import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { SCENARIOS } from "@/lib/scenarios/registry";
import { clampYear } from "@/lib/time/range";
import type { LayerState } from "@/components/layers/LayerPanel";
import { normalizeView, type MapView } from "@/lib/state/view";
import { DEFAULT_MODE, modeBaseState, parseMode, type Mode } from "@/lib/modes";

export interface AppState {
  /** Phase 9 IA mode (URL `mode`). Missing/unknown → Infrastructure. */
  readonly mode: Mode;
  readonly year: number;
  readonly commodity: Commodity;
  readonly scenario: ScenarioId | null;
  readonly layers: LayerState;
}

const COMMODITIES: readonly Commodity[] = ["oil", "gas"];
const LAYER_KEYS: readonly (keyof LayerState)[] = [
  "reserves",
  "basins",
  "extraction",
  "pipelines",
  "refineries",
  "storage",
  "ports",
  "gas_pipelines",
  "lng_terminals",
  "lng_voyages",
];

export function encodeAppState(state: AppState): string {
  const params = new URLSearchParams();
  params.set("mode", state.mode);
  params.set("year", String(state.year));
  params.set("commodity", state.commodity);
  if (state.scenario !== null) params.set("scenario", state.scenario);
  const enabled = LAYER_KEYS.filter((k) => state.layers[k]);
  params.set("layers", enabled.join(","));
  return params.toString();
}

/**
 * Decode app state. An explicit, known `mode` swaps the base from `defaults`
 * to that mode's preset (`modeBaseState`); every other param present in the
 * URL then overrides the base field by field — so a mode preset only fills
 * gaps and never changes what an explicit param says. Missing or unknown
 * `mode` decodes as Infrastructure against `defaults`, exactly as pre-mode
 * URLs always did.
 */
export function decodeAppState(
  params: URLSearchParams,
  appDefaults: AppState,
): AppState {
  const explicitMode = parseMode(params.get("mode"));
  const mode: Mode = explicitMode ?? DEFAULT_MODE;
  const defaults =
    explicitMode !== null ? modeBaseState(appDefaults, explicitMode) : { ...appDefaults, mode };

  const rawYear = params.get("year");
  let year = defaults.year;
  if (rawYear !== null) {
    const n = Number(rawYear);
    if (rawYear.trim() !== "" && Number.isFinite(n) && Number.isInteger(n)) {
      year = clampYear(n);
    }
  }

  const rawCommodity = params.get("commodity");
  const commodity: Commodity =
    rawCommodity !== null && (COMMODITIES as readonly string[]).includes(rawCommodity)
      ? (rawCommodity as Commodity)
      : defaults.commodity;

  const rawScenario = params.get("scenario");
  let scenario: ScenarioId | null = defaults.scenario;
  if (rawScenario !== null) {
    const known = SCENARIOS.find((s) => s.id === rawScenario);
    scenario = known ? known.id : null;
  }

  const rawLayers = params.get("layers");
  let layers = defaults.layers;
  if (rawLayers !== null) {
    const enabled = new Set(rawLayers.split(",").filter(Boolean));
    const next = {} as LayerState;
    for (const k of LAYER_KEYS) {
      next[k] = enabled.has(k);
    }
    layers = next;
  }

  return { mode, year, commodity, scenario, layers };
}

/**
 * Serialise the map camera as `lon`, `lat`, `z` params (2 decimals, wrapped
 * and clamped). Kept separate from `encodeAppState` so `AppState` — the shape
 * page.tsx builds its defaults from — does not change.
 */
export function encodeView(view: MapView): string {
  const v = normalizeView(view);
  const params = new URLSearchParams();
  params.set("lon", String(v.lon));
  params.set("lat", String(v.lat));
  params.set("z", String(v.zoom));
  return params.toString();
}

function parseFiniteParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Decode `lon`/`lat`/`z`. Each param falls back to the default independently
 * when missing or unparseable; parsed values are wrapped/clamped to the map's
 * limits and rounded to URL precision.
 */
export function decodeView(params: URLSearchParams, defaults: MapView): MapView {
  return normalizeView({
    lon: parseFiniteParam(params, "lon") ?? defaults.lon,
    lat: parseFiniteParam(params, "lat") ?? defaults.lat,
    zoom: parseFiniteParam(params, "z") ?? defaults.zoom,
  });
}

/** Full querystring (no leading `?`) for the app state plus the map view. */
export function encodeUrlState(state: AppState, view: MapView): string {
  return `${encodeAppState(state)}&${encodeView(view)}`;
}
