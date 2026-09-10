import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { SCENARIOS } from "@/lib/scenarios/registry";
import { clampYear } from "@/lib/time/range";
import type { LayerState } from "@/components/layers/LayerPanel";

export interface AppState {
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
  params.set("year", String(state.year));
  params.set("commodity", state.commodity);
  if (state.scenario !== null) params.set("scenario", state.scenario);
  const enabled = LAYER_KEYS.filter((k) => state.layers[k]);
  params.set("layers", enabled.join(","));
  return params.toString();
}

export function decodeAppState(
  params: URLSearchParams,
  defaults: AppState,
): AppState {
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

  return { year, commodity, scenario, layers };
}
