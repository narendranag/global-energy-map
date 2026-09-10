import { describe, expect, it } from "vitest";
import {
  applyMode,
  DEFAULT_APP_STATE,
  EXAMPLE_QUESTIONS,
  FLOWS_DEFAULT_YEAR,
  layersOpenByDefault,
  MODE_DEFS,
  MODE_LAYERS,
  MODES,
  modeBaseState,
  parseMode,
  TRADE_LAST_YEAR,
} from "@/lib/modes";
import { decodeAppState, encodeAppState, type AppState } from "@/lib/url-state/encode";
import { SCENARIOS } from "@/lib/scenarios/registry";
import { YEAR_MAX, YEAR_MIN } from "@/lib/time/range";

const on = (s: AppState) =>
  Object.entries(s.layers)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();

describe("parseMode", () => {
  it("accepts the three modes and rejects anything else", () => {
    for (const m of MODES) expect(parseMode(m)).toBe(m);
    expect(parseMode(null)).toBeNull();
    expect(parseMode("")).toBeNull();
    expect(parseMode("Flows")).toBeNull();
    expect(parseMode("trade")).toBeNull();
  });

  it("has a label and blurb for every mode", () => {
    for (const m of MODES) {
      expect(MODE_DEFS[m].id).toBe(m);
      expect(MODE_DEFS[m].label.length).toBeGreaterThan(0);
      expect(MODE_DEFS[m].blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("default state (D1)", () => {
  it("is Infrastructure, oil, 2020, no scenario", () => {
    expect(DEFAULT_APP_STATE).toMatchObject({
      mode: "infrastructure",
      year: 2020,
      commodity: "oil",
      scenario: null,
    });
  });

  it("shows at most five layers: reserves, both pipelines, refineries, LNG terminals", () => {
    expect(on(DEFAULT_APP_STATE)).toEqual(
      ["gas_pipelines", "lng_terminals", "pipelines", "refineries", "reserves"],
    );
  });

  it("keeps extraction, basins, storage, ports and voyages off", () => {
    const l = DEFAULT_APP_STATE.layers;
    expect([l.extraction, l.basins, l.storage, l.ports, l.lng_voyages]).toEqual([false, false, false, false, false]);
  });

  it("opens the Layers disclosure only in Infrastructure", () => {
    expect(layersOpenByDefault("infrastructure")).toBe(true);
    expect(layersOpenByDefault("flows")).toBe(false);
    expect(layersOpenByDefault("scenarios")).toBe(false);
  });
});

describe("applyMode", () => {
  const custom: AppState = {
    mode: "infrastructure",
    year: 2008,
    commodity: "oil",
    scenario: null,
    layers: { ...DEFAULT_APP_STATE.layers, storage: true, ports: true },
  };

  it("Infrastructure: preset layers, keeps year and commodity, clears the scenario", () => {
    const s = applyMode({ ...custom, mode: "scenarios", commodity: "gas", scenario: "hormuz" }, "infrastructure");
    expect(s).toEqual({
      mode: "infrastructure",
      year: 2008,
      commodity: "gas",
      scenario: null,
      layers: MODE_LAYERS.infrastructure,
    });
  });

  it("Flows: gas, voyages + LNG terminals + gas pipelines, year → 2023 outside 2020–2024", () => {
    const s = applyMode(custom, "flows");
    expect(s.mode).toBe("flows");
    expect(s.commodity).toBe("gas");
    expect(s.year).toBe(FLOWS_DEFAULT_YEAR);
    expect(on(s)).toEqual(["gas_pipelines", "lng_terminals", "lng_voyages"]);
  });

  it("Flows keeps a year already inside the voyage range", () => {
    expect(applyMode({ ...custom, year: 2021 }, "flows").year).toBe(2021);
    expect(applyMode({ ...custom, year: 2020 }, "flows").year).toBe(2020);
    expect(applyMode({ ...custom, year: 2024 }, "flows").year).toBe(2024);
    expect(applyMode({ ...custom, year: 2019 }, "flows").year).toBe(FLOWS_DEFAULT_YEAR);
  });

  it("Flows clears the scenario", () => {
    expect(applyMode({ ...custom, scenario: "hormuz" }, "flows").scenario).toBeNull();
  });

  it("Scenarios: reserves carries the exposure ramp; keeps commodity, year and scenario", () => {
    const s = applyMode({ ...custom, commodity: "gas", scenario: "hormuz" }, "scenarios");
    expect(s.mode).toBe("scenarios");
    expect(s.commodity).toBe("gas");
    expect(s.year).toBe(2008);
    expect(s.scenario).toBe("hormuz");
    expect(s.layers.reserves).toBe(true);
  });

  it("Scenarios moves a pre-BACI year (< 1995) to the latest trade year", () => {
    expect(applyMode({ ...custom, year: 1990 }, "scenarios").year).toBe(TRADE_LAST_YEAR);
    expect(applyMode({ ...custom, year: 1995 }, "scenarios").year).toBe(1995);
  });

  it("is pure (does not mutate its input) and idempotent", () => {
    const frozen = Object.freeze({ ...custom, layers: Object.freeze({ ...custom.layers }) });
    for (const m of MODES) {
      const once = applyMode(frozen, m);
      expect(applyMode(once, m)).toEqual(once);
    }
    expect(frozen.layers.storage).toBe(true);
  });

  it("never enables more than five layers", () => {
    for (const m of MODES) expect(on(applyMode(custom, m)).length).toBeLessThanOrEqual(5);
  });
});

describe("URL precedence", () => {
  const decode = (qs: string) => decodeAppState(new URLSearchParams(qs), DEFAULT_APP_STATE);

  it("modeBaseState(defaults, default mode) is the defaults themselves", () => {
    expect(modeBaseState(DEFAULT_APP_STATE, "infrastructure")).toBe(DEFAULT_APP_STATE);
  });

  it("?mode=flows alone shows the Flows preset", () => {
    expect(decode("mode=flows")).toEqual(applyMode(DEFAULT_APP_STATE, "flows"));
  });

  it("a pre-mode URL with layers shows exactly those layers (no preset leaks in)", () => {
    const s = decode("year=2015&commodity=oil&layers=basins,storage,ports,extraction");
    expect(s.mode).toBe("infrastructure");
    expect(on(s)).toEqual(["basins", "extraction", "ports", "storage"]);
    expect(s.year).toBe(2015);
  });

  it("explicit year / commodity / scenario / layers beat the preset", () => {
    const s = decode("mode=flows&year=2010&commodity=oil&scenario=druzhba&layers=pipelines");
    expect(s).toEqual({
      mode: "flows",
      year: 2010,
      commodity: "oil",
      scenario: "druzhba",
      layers: { ...MODE_LAYERS.flows, gas_pipelines: false, lng_terminals: false, lng_voyages: false, pipelines: true },
    });
  });

  it("every state the app writes decodes back to itself", () => {
    const states = [DEFAULT_APP_STATE, ...MODES.map((m) => applyMode(DEFAULT_APP_STATE, m)), ...EXAMPLE_QUESTIONS.map((q) => q.state)];
    for (const s of states) expect(decode(encodeAppState(s))).toEqual(s);
  });
});

describe("EXAMPLE_QUESTIONS", () => {
  it("has 3–4 questions with unique ids", () => {
    expect(EXAMPLE_QUESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(EXAMPLE_QUESTIONS.length).toBeLessThanOrEqual(4);
    expect(new Set(EXAMPLE_QUESTIONS.map((q) => q.id)).size).toBe(EXAMPLE_QUESTIONS.length);
  });

  it("each sets a valid year, and any scenario exists for its commodity and is in Scenarios mode", () => {
    for (const q of EXAMPLE_QUESTIONS) {
      expect(q.state.year).toBeGreaterThanOrEqual(YEAR_MIN);
      expect(q.state.year).toBeLessThanOrEqual(YEAR_MAX);
      expect(on(q.state).length).toBeGreaterThan(0);
      if (q.state.scenario !== null) {
        const def = SCENARIOS.find((s) => s.id === q.state.scenario);
        expect(def?.commodities).toContain(q.state.commodity);
        expect(q.state.mode).toBe("scenarios");
      }
    }
  });

  it("the Druzhba and Hormuz questions set their scenario and year", () => {
    const byId = new Map(EXAMPLE_QUESTIONS.map((q) => [q.id, q.state]));
    expect(byId.get("druzhba-2022")).toMatchObject({ scenario: "druzhba", year: 2022, commodity: "oil" });
    expect(byId.get("hormuz-2024")).toMatchObject({ scenario: "hormuz", year: 2024, commodity: "oil" });
    expect(byId.get("qatar-lng-2023")).toMatchObject({ mode: "flows", year: 2023, commodity: "gas" });
    expect(byId.get("pipelines-1995")).toMatchObject({ mode: "infrastructure", year: 1995 });
  });
});
