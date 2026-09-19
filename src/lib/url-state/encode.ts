import type { Commodity, ScenarioId } from "@/lib/scenarios/types";
import { SCENARIOS, scenarioForCommodity } from "@/lib/scenarios/registry";
import { clampYear } from "@/lib/time/range";
import type { LayerState } from "@/components/layers/LayerPanel";
import { normalizeView, type MapView } from "@/lib/state/view";
import { DEFAULT_MODE, modeBaseState, parseMode, type Mode } from "@/lib/modes";
import { parseIso3 } from "@/lib/geo/iso3";

export interface AppState {
  /** Phase 9 IA mode (URL `mode`). Missing/unknown → Infrastructure. */
  readonly mode: Mode;
  readonly year: number;
  readonly commodity: Commodity;
  readonly scenario: ScenarioId | null;
  /**
   * T1: a second scenario closed at the same time, or null. It gets its own
   * param (`scenario2=`) rather than overloading `scenario=a+b`, so every
   * parser that ever read `scenario` — old shared links, the smoke script,
   * `/methodology` — keeps reading exactly one known id.
   *
   * Only meaningful alongside a primary: decoding drops it when there is no
   * `scenario`, when it repeats the primary, or when the commodity axis does
   * not model it (the rule `scenario` itself follows).
   */
  readonly scenario2: ScenarioId | null;
  /**
   * T1: how much of the route(s) is cut, 0.05–1. 1 is the full closure every
   * link shared so far means. Serialised as the integer percentage `sev=`,
   * omitted at 100, so no existing URL changes by a byte.
   */
  readonly severity: number;
  /**
   * T1: which side of the cut the scenario panel lists and the map shades —
   * importers (who loses supply) or exporters (who loses the outlet). App
   * state rather than panel-local React state because it repaints the map:
   * a copied link that did not carry it would not show what was on screen.
   */
  readonly view: ScenarioView;
  /**
   * Selected country (ISO3), or null. A *selection*, not a filter: it outlines
   * one country and tells the panels/flows/search which country to talk about.
   * Modes deliberately leave it alone (see `applyMode`).
   */
  readonly focus: string | null;
  readonly layers: LayerState;
}

/** Which side of a scenario's flows the panel and overlay describe. */
export type ScenarioView = "importers" | "exporters";

const SCENARIO_VIEWS: readonly ScenarioView[] = ["importers", "exporters"];

/**
 * Severity travels as a percentage, never a float: `sev=50` reads as "half the
 * route", and an integer keeps the querystring stable as the slider moves.
 * The floor is 5 % — below that the closure rounds to nothing on every readout
 * the panel has, and 0 would paint a scenario that does nothing at all.
 */
export const SEVERITY_MIN_PCT = 5;
export const SEVERITY_STEP_PCT = 5;

/** A `sev=` value as the app uses it: an integer percentage in [5, 100]. */
export function clampSeverityPct(pct: number): number {
  return Math.min(100, Math.max(SEVERITY_MIN_PCT, Math.round(pct)));
}

/**
 * A `sev=` parameter as a severity fraction, or null when the URL does not
 * say anything we are willing to act on.
 *
 * Out-of-range is **invalid, not clamped** (findings 18/19). `sev=0` is a
 * hand-typed "nothing is cut", and rounding it *up* to the 5 % floor invents
 * a closure the link never asked for — the same objection that already sent
 * `sev=banana` to the default. A bad parameter of any shape therefore decodes
 * exactly like a missing one: the default, 100 %.
 *
 * Non-multiples of 5 are accepted (`sev=37` → 37 %). The step is the
 * slider's business, not the URL's: a link can say 37 %, the slider will
 * simply show the nearest notch if the viewer then drags it. Fractions are
 * rounded to the integer percent the querystring format carries.
 */
export function parseSeverityPct(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const pct = Math.round(n);
  return pct >= SEVERITY_MIN_PCT && pct <= 100 ? pct : null;
}

/**
 * The scenario pair a commodity axis can actually render. A scenario with no
 * route rows for the axis can only produce a confident 0 % (A1), so it is
 * dropped — and a second scenario without a primary, or equal to it, is not a
 * combination at all.
 */
export function normalizeScenarioPair(
  scenario: ScenarioId | null,
  scenario2: ScenarioId | null,
  commodity: Commodity,
): { readonly scenario: ScenarioId | null; readonly scenario2: ScenarioId | null } {
  const primary = scenarioForCommodity(scenario, commodity);
  if (primary === null) return { scenario: null, scenario2: null };
  const second = scenarioForCommodity(scenario2, commodity);
  return { scenario: primary, scenario2: second === primary ? null : second };
}

/** Every scenario a result covers, primary first: `[]` when none is active. */
export function activeScenarioIds(state: {
  readonly scenario: ScenarioId | null;
  readonly scenario2: ScenarioId | null;
}): readonly ScenarioId[] {
  if (state.scenario === null) return [];
  return state.scenario2 === null ? [state.scenario] : [state.scenario, state.scenario2];
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
  // Appended, never inserted: the order is the URL's wire format, so adding
  // a key anywhere but the end would re-map every previously shared link.
  "gas_storage",
  "shale_regions",
  "recent_imports",
  "trade_flows",
];

export function encodeAppState(state: AppState): string {
  const params = new URLSearchParams();
  params.set("mode", state.mode);
  params.set("year", String(state.year));
  params.set("commodity", state.commodity);
  if (state.scenario !== null) params.set("scenario", state.scenario);
  // Written only alongside a primary, and only when set — a single-scenario
  // link stays byte-for-byte what it was before combinations existed.
  if (state.scenario !== null && state.scenario2 !== null) {
    params.set("scenario2", state.scenario2);
  }
  // Severity and the view are modifiers of a scenario: with no `scenario`
  // there is nothing for them to modify, and a dangling `sev=`/`view=` would
  // be re-emitted for ever by the debounced `replaceState` (finding 19).
  if (state.scenario !== null && state.severity < 1) {
    params.set("sev", String(clampSeverityPct(state.severity * 100)));
  }
  if (state.scenario !== null && state.view !== "importers") params.set("view", state.view);
  // Written only when set, so every link shared before `focus` existed — and
  // every link shared with nothing selected — is byte-for-byte what it was.
  if (state.focus !== null) params.set("focus", state.focus);
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
  let scenario2: ScenarioId | null = defaults.scenario2;
  const rawScenario2 = params.get("scenario2");
  if (rawScenario2 !== null) {
    const known2 = SCENARIOS.find((s) => s.id === rawScenario2);
    scenario2 = known2 ? known2.id : null;
  }
  // A scenario the commodity axis does not model has no route rows, so it can
  // only render a confident 0 %. Drop it, as the commodity toggle does (A1) —
  // and drop the second with it, or when it merely repeats the primary.
  ({ scenario, scenario2 } = normalizeScenarioPair(scenario, scenario2, commodity));

  // An out-of-range, unparseable or empty `sev` falls back to the default
  // rather than clamping: a bad parameter must neither invent a closure nor
  // silently erase one (findings 18/19). Only 5–100 is honoured.
  const severityPctValue = parseSeverityPct(params.get("sev"));

  const rawView = params.get("view");
  const viewValue: ScenarioView =
    rawView !== null && (SCENARIO_VIEWS as readonly string[]).includes(rawView)
      ? (rawView as ScenarioView)
      : defaults.view;

  // Both are scenario modifiers: with no scenario left after `A1`, they are
  // dropped — decoded as the defaults, so `encodeAppState` never writes them
  // back out (finding 19).
  const severity =
    scenario === null || severityPctValue === null ? defaults.severity : severityPctValue / 100;
  const view: ScenarioView = scenario === null ? defaults.view : viewValue;

  // A `focus` we cannot draw is no focus at all: an unknown or malformed code
  // decodes to null rather than leaving a phantom selection in the URL.
  const focus = params.has("focus") ? parseIso3(params.get("focus")) : defaults.focus;

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

  return { mode, year, commodity, scenario, scenario2, severity, view, focus, layers };
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
