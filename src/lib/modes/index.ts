/**
 * Modes (Phase 9, §4.1): three ways into the map, each a *starting point* —
 * a default layer set, plus commodity / year where the mode needs them.
 *
 * Pure functions only. Two rules keep shared URLs stable:
 *   1. A mode preset is applied when the user *selects* a mode (a tab or an
 *      example question) — `applyMode`.
 *   2. When a URL is decoded, the preset for its `mode` only fills params the
 *      URL does not carry — `modeBaseState` supplies the base, and every
 *      explicit param (`layers`, `year`, `commodity`, `scenario`) wins. A URL
 *      without `mode` (every pre-Phase-9 link) decodes exactly as before, as
 *      Infrastructure.
 */
import type { LayerState } from "@/components/layers/LayerPanel";
import type { AppState } from "@/lib/url-state/encode";
import type { ScenarioId } from "@/lib/scenarios/types";

export type Mode = "infrastructure" | "flows" | "scenarios";

export const MODES: readonly Mode[] = ["infrastructure", "flows", "scenarios"];

export const DEFAULT_MODE: Mode = "infrastructure";

export interface ModeDef {
  readonly id: Mode;
  readonly label: string;
  /** One line, shown as the tab's tooltip and description. */
  readonly blurb: string;
}

export const MODE_DEFS: Readonly<Record<Mode, ModeDef>> = {
  infrastructure: {
    id: "infrastructure",
    label: "Infrastructure",
    blurb: "What exists, and when: reserves, pipelines, refineries, LNG terminals.",
  },
  flows: {
    id: "flows",
    label: "Flows",
    blurb: "Who bought crude and LNG from whom, 1995–2024 (BACI bilateral trade).",
  },
  scenarios: {
    id: "scenarios",
    label: "Scenarios",
    blurb: "Close a chokepoint or cut a pipeline; see who is exposed.",
  },
};

/** Parse a `mode` URL param; unknown or missing → null. */
export function parseMode(raw: string | null): Mode | null {
  return raw !== null && (MODES as readonly string[]).includes(raw) ? (raw as Mode) : null;
}

const NO_LAYERS: LayerState = {
  gas_storage: false,
  shale_regions: false,
  recent_imports: false,
  trade_flows: false,
  reserves: false,
  basins: false,
  extraction: false,
  pipelines: false,
  refineries: false,
  storage: false,
  ports: false,
  gas_pipelines: false,
  lng_terminals: false,
  lng_voyages: false,
};

function only(...keys: (keyof LayerState)[]): LayerState {
  const next = { ...NO_LAYERS };
  for (const k of keys) next[k] = true;
  return next;
}

/**
 * Per-mode default layers. Infrastructure is the app default (D1: ≤ 5 layers;
 * extraction, basins, storage, ports off). The scenario exposure ramp is drawn
 * on the reserves (country) layer, so Scenarios keeps it on.
 */
/**
 * Flows dropped `lng_voyages` from its default set (S2, 2026-09-19): country-
 * pair BACI arcs (`trade_flows`) and terminal-to-terminal LNG-T3 voyages both
 * draw great-circle arcs between roughly the same points for the same
 * commodity, one aggregated-annual and one voyage-level — on together they
 * read as double vision, not two kinds of information, which is the
 * hairball problem this layer exists to fix. `lng_voyages` stays a manual
 * toggle for the voyage-level view; `trade_flows` is what Flows opens with.
 */
export const MODE_LAYERS: Readonly<Record<Mode, LayerState>> = {
  infrastructure: only("reserves", "pipelines", "gas_pipelines", "refineries", "lng_terminals"),
  flows: only("gas_pipelines", "lng_terminals", "trade_flows"),
  scenarios: only("reserves", "pipelines", "refineries", "lng_terminals"),
};

/** LNG-T3 voyage coverage (mirrors `src/lib/data/voyages.ts`). */
export const FLOWS_FIRST_YEAR = 2020;
export const FLOWS_LAST_YEAR = 2024;
/**
 * Year Flows jumps to when the current year has no BACI trade data — the
 * latest BACI year (mirrors `TRADE_LAST_YEAR` / `src/lib/data/trade-flows.ts`).
 * Also LNG-T3's range end, though LNG-T3's own 2024 snapshot is thinner
 * (1,592 voyages vs 3,958 in 2023) — `lng_voyages` is off by default in this
 * preset, so that does not affect what Flows opens showing.
 */
export const FLOWS_DEFAULT_YEAR = 2024;
/** BACI trade coverage: scenarios have no trade data before this year (mirrors `src/lib/data/trade-flows.ts`). */
export const TRADE_FIRST_YEAR = 1995;
export const TRADE_LAST_YEAR = 2024;

/** Default year on first load: the last year with a live reserves value. */
export const DEFAULT_YEAR = 2020;

/** The app's default state: Infrastructure mode, oil, 2020, no scenario, nothing focused. */
export const DEFAULT_APP_STATE: AppState = {
  mode: DEFAULT_MODE,
  year: DEFAULT_YEAR,
  commodity: "oil",
  scenario: null,
  scenario2: null,
  severity: 1,
  view: "importers",
  focus: null,
  layers: MODE_LAYERS[DEFAULT_MODE],
};

/**
 * T1: everything a scenario carries, cleared together. A severity or an
 * exporter view left behind by a scenario that is no longer active would sit
 * in the URL describing nothing, and would reappear on the next scenario.
 */
const NO_SCENARIO = {
  scenario: null,
  scenario2: null,
  severity: 1,
  view: "importers",
} as const;

/** True when the Layers disclosure starts expanded for this mode. */
export function layersOpenByDefault(mode: Mode): boolean {
  return mode === "infrastructure";
}

/**
 * Select `mode` from `state`: the mode's layers replace the current set, and
 * commodity / year move only where the mode needs them —
 *  - Flows: gas; year → 2024 (the latest BACI year) unless already inside
 *    BACI's 1995–2024 coverage, so a year already showing meaningful trade
 *    flows is left alone — `trade_flows` is the default layer here, not
 *    `lng_voyages`, so the range checked is BACI's, not LNG-T3's 2020–2024.
 *  - Scenarios: year → latest BACI year if before BACI coverage (1995).
 * Leaving Scenarios clears the active scenario (the tab is where disruptions
 * live); entering it keeps any scenario already chosen.
 *
 * `focus` is deliberately *not* touched. A mode is a way of looking at the
 * map; the focused country is what you are looking at. Dropping the selection
 * on every tab click would make "see this country's flows" a two-step gesture
 * and would silently rewrite a shared `?mode=flows&focus=JPN` link.
 */
export function applyMode(state: AppState, mode: Mode): AppState {
  const layers = MODE_LAYERS[mode];
  switch (mode) {
    case "infrastructure":
      return { ...state, mode, layers, ...NO_SCENARIO };
    case "flows": {
      const inRange = state.year >= TRADE_FIRST_YEAR && state.year <= TRADE_LAST_YEAR;
      return {
        ...state,
        mode,
        layers,
        commodity: "gas",
        year: inRange ? state.year : FLOWS_DEFAULT_YEAR,
        ...NO_SCENARIO,
      };
    }
    case "scenarios":
      return {
        ...state,
        mode,
        layers,
        year: state.year < TRADE_FIRST_YEAR ? TRADE_LAST_YEAR : state.year,
      };
  }
}

/**
 * Base state a URL with an explicit `mode` decodes against: the mode preset
 * applied to the app defaults. Explicit URL params then override it field by
 * field (see `decodeAppState`).
 */
export function modeBaseState(defaults: AppState, mode: Mode): AppState {
  return mode === defaults.mode ? defaults : applyMode(defaults, mode);
}

// ---------------------------------------------------------------------------
// Example questions (IntroCard chips)
// ---------------------------------------------------------------------------

export interface ExampleQuestion {
  readonly id: string;
  readonly label: string;
  /** Full state to apply: a mode preset plus the question's own settings. */
  readonly state: AppState;
}

function question(
  id: string,
  label: string,
  mode: Mode,
  settings: {
    year: number;
    commodity: AppState["commodity"];
    scenario?: ScenarioId;
    layers?: LayerState;
    focus?: string;
  },
): ExampleQuestion {
  const base = applyMode(DEFAULT_APP_STATE, mode);
  return {
    id,
    label,
    state: {
      ...base,
      year: settings.year,
      commodity: settings.commodity,
      scenario: settings.scenario ?? null,
      focus: settings.focus ?? null,
      layers: settings.layers ?? base.layers,
    },
  };
}

export const EXAMPLE_QUESTIONS: readonly ExampleQuestion[] = [
  question("druzhba-2022", "How exposed is Central Europe to a Druzhba cut? (2022)", "scenarios", {
    year: 2022,
    commodity: "oil",
    scenario: "druzhba",
  }),
  question("hormuz-2024", "Who loses most if Hormuz closes? (2024, crude)", "scenarios", {
    year: 2024,
    commodity: "oil",
    scenario: "hormuz",
  }),
  // Focused so it shows every one of Qatar's flows (BACI trade_flows), not
  // just the pairs that make the world top 150 — the point of the focus view.
  question("qatar-lng-2023", "Where did Qatar's LNG go in 2023?", "flows", {
    year: 2023,
    commodity: "gas",
    focus: "QAT",
  }),
  question("pipelines-1995", "Which pipelines existed in 1995?", "infrastructure", {
    year: 1995,
    commodity: "oil",
    layers: only("pipelines", "gas_pipelines"),
  }),
];
