import { describe, it, expect } from "vitest";
import {
  encodeAppState,
  decodeAppState,
  encodeView,
  decodeView,
  encodeUrlState,
  type AppState,
} from "@/lib/url-state/encode";
import { DEFAULT_VIEW, MAX_LAT, MAX_ZOOM, MIN_ZOOM, type MapView } from "@/lib/state/view";
import type { LayerState } from "@/components/layers/LayerPanel";
import { applyMode, MODE_LAYERS } from "@/lib/modes";

const ALL_ON: LayerState = {
  reserves: true,
  basins: true,
  extraction: true,
  pipelines: true,
  refineries: true,
  storage: true,
  ports: true,
  gas_pipelines: true,
  lng_terminals: true,
  lng_voyages: true,
  gas_storage: false,
  shale_regions: false,
  recent_imports: false,
  trade_flows: false,
};

const ALL_OFF: LayerState = {
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
  gas_storage: false,
  shale_regions: false,
  recent_imports: false,
  trade_flows: false,
};

const DEFAULTS: AppState = {
  mode: "infrastructure",
  year: 2020,
  commodity: "oil",
  scenario: null,
  scenario2: null,
  severity: 1,
  view: "importers",
  focus: null,
  layers: ALL_ON,
};

describe("encodeAppState", () => {
  it("encodes a non-default state to a querystring", () => {
    const qs = encodeAppState({
      mode: "infrastructure",
      year: 2015,
      commodity: "gas",
      scenario: "hormuz",
      scenario2: null,
      severity: 1,
      view: "importers",
      focus: null,
      layers: { ...ALL_ON, basins: false, ports: false },
    });
    const params = new URLSearchParams(qs);
    expect(params.get("year")).toBe("2015");
    expect(params.get("commodity")).toBe("gas");
    expect(params.get("scenario")).toBe("hormuz");
    const layers = params.get("layers")?.split(",") ?? [];
    expect(layers).not.toContain("basins");
    expect(layers).not.toContain("ports");
    expect(layers).toContain("reserves");
  });
});

describe("decodeAppState", () => {
  it("round-trips a full state", () => {
    const original: AppState = {
      mode: "infrastructure",
      year: 2015,
      commodity: "gas",
      scenario: "hormuz",
      scenario2: null,
      severity: 1,
      view: "importers",
      focus: null,
      layers: { ...ALL_ON, basins: false, ports: false, gas_pipelines: false },
    };
    const qs = encodeAppState(original);
    const decoded = decodeAppState(new URLSearchParams(qs), DEFAULTS);
    expect(decoded).toEqual(original);
  });

  it("falls back to defaults for missing year", () => {
    const decoded = decodeAppState(new URLSearchParams("commodity=gas"), DEFAULTS);
    expect(decoded.year).toBe(2020);
    expect(decoded.commodity).toBe("gas");
  });

  it("ignores unknown commodity (falls back to default)", () => {
    const decoded = decodeAppState(new URLSearchParams("commodity=coal"), DEFAULTS);
    expect(decoded.commodity).toBe("oil");
  });

  it("ignores unknown scenario (falls back to null)", () => {
    const decoded = decodeAppState(new URLSearchParams("scenario=nonexistent"), DEFAULTS);
    expect(decoded.scenario).toBeNull();
  });

  it("ignores unknown layer keys in the layers list", () => {
    const decoded = decodeAppState(
      new URLSearchParams("layers=reserves,basins,fictional"),
      DEFAULTS,
    );
    expect(decoded.layers.reserves).toBe(true);
    expect(decoded.layers.basins).toBe(true);
    // Layers not mentioned default to false (URL is authoritative)
    expect(decoded.layers.refineries).toBe(false);
  });

  it("falls back to defaults for non-numeric year", () => {
    const decoded = decodeAppState(new URLSearchParams("year=banana"), DEFAULTS);
    expect(decoded.year).toBe(2020);
  });

  it("clamps an absurdly large year to the range maximum (2024)", () => {
    const decoded = decodeAppState(new URLSearchParams("year=99999"), DEFAULTS);
    expect(decoded.year).toBe(2024);
  });

  it("clamps a year before the range to the range minimum (1990)", () => {
    const decoded = decodeAppState(new URLSearchParams("year=1800"), DEFAULTS);
    expect(decoded.year).toBe(1990);
  });

  it("falls back to the default for year=abc", () => {
    const decoded = decodeAppState(new URLSearchParams("year=abc"), DEFAULTS);
    expect(decoded.year).toBe(2020);
  });

  it("accepts the full 1990–2024 range unchanged", () => {
    expect(decodeAppState(new URLSearchParams("year=1990"), DEFAULTS).year).toBe(1990);
    expect(decodeAppState(new URLSearchParams("year=2024"), DEFAULTS).year).toBe(2024);
  });

  it("round-trips with lng_voyages flag toggled on", () => {
    const state: AppState = {
      mode: "infrastructure",
      year: 2023,
      commodity: "gas",
      scenario: "hormuz",
      scenario2: null,
      severity: 1,
      view: "importers",
      focus: null,
      layers: { ...ALL_ON, lng_voyages: true },
    };
    const qs = encodeAppState(state);
    const decoded = decodeAppState(new URLSearchParams(qs), DEFAULTS);
    expect(decoded.layers.lng_voyages).toBe(true);
  });

  it("decodes a URL missing lng_voyages to the default (false)", () => {
    // Forward-compat: pre-Phase-6 bookmarks land with lng_voyages=false.
    const decoded = decodeAppState(
      new URLSearchParams("year=2020&layers=reserves,basins,extraction"),
      DEFAULTS,
    );
    expect(decoded.layers.lng_voyages).toBe(false);
  });
});

describe("severity, a second scenario and the exporter view (T1)", () => {
  const base: AppState = { ...DEFAULTS, scenario: "hormuz" };

  it("writes nothing for the defaults, so every pre-T1 link is byte-identical", () => {
    const qs = encodeAppState(base);
    const params = new URLSearchParams(qs);
    expect(params.has("sev")).toBe(false);
    expect(params.has("scenario2")).toBe(false);
    expect(params.has("view")).toBe(false);
  });

  it("round-trips a half closure as an integer percentage", () => {
    const qs = encodeAppState({ ...base, severity: 0.5 });
    expect(new URLSearchParams(qs).get("sev")).toBe("50");
    expect(decodeAppState(new URLSearchParams(qs), DEFAULTS).severity).toBe(0.5);
  });

  it("clamps sev to 5–100 and rounds it", () => {
    const d = (qs: string) => decodeAppState(new URLSearchParams(qs), DEFAULTS).severity;
    expect(d("sev=0")).toBe(0.05);
    expect(d("sev=-40")).toBe(0.05);
    expect(d("sev=400")).toBe(1);
    expect(d("sev=37.4")).toBe(0.37);
  });

  it("falls back to the default for an unparseable sev rather than inventing 0", () => {
    expect(decodeAppState(new URLSearchParams("sev=banana"), DEFAULTS).severity).toBe(1);
    expect(decodeAppState(new URLSearchParams("sev="), DEFAULTS).severity).toBe(1);
  });

  it("round-trips a second scenario as its own parameter, never scenario=a+b", () => {
    const qs = encodeAppState({ ...base, scenario2: "malacca" });
    const params = new URLSearchParams(qs);
    expect(params.get("scenario")).toBe("hormuz");
    expect(params.get("scenario2")).toBe("malacca");
    const decoded = decodeAppState(new URLSearchParams(qs), DEFAULTS);
    expect(decoded.scenario).toBe("hormuz");
    expect(decoded.scenario2).toBe("malacca");
  });

  it("drops a second scenario with no primary, or one that repeats it", () => {
    expect(decodeAppState(new URLSearchParams("scenario2=malacca"), DEFAULTS).scenario2).toBeNull();
    expect(
      decodeAppState(new URLSearchParams("scenario=hormuz&scenario2=hormuz"), DEFAULTS).scenario2,
    ).toBeNull();
  });

  it("drops a second scenario the commodity axis does not model", () => {
    // Druzhba is crude-only: on the gas axis it has no route rows at all.
    const d = decodeAppState(
      new URLSearchParams("commodity=gas&scenario=hormuz&scenario2=druzhba"),
      DEFAULTS,
    );
    expect(d.scenario).toBe("hormuz");
    expect(d.scenario2).toBeNull();
  });

  it("drops both when the primary does not model the commodity", () => {
    const d = decodeAppState(
      new URLSearchParams("commodity=gas&scenario=druzhba&scenario2=malacca"),
      DEFAULTS,
    );
    expect(d.scenario).toBeNull();
    expect(d.scenario2).toBeNull();
  });

  it("round-trips the exporter view and ignores an unknown one", () => {
    const qs = encodeAppState({ ...base, view: "exporters" });
    expect(new URLSearchParams(qs).get("view")).toBe("exporters");
    expect(decodeAppState(new URLSearchParams(qs), DEFAULTS).view).toBe("exporters");
    expect(decodeAppState(new URLSearchParams("view=sideways"), DEFAULTS).view).toBe("importers");
  });
});

describe("decodeAppState — mode", () => {
  const decode = (qs: string) => decodeAppState(new URLSearchParams(qs), DEFAULTS);

  it("encodes the mode", () => {
    expect(new URLSearchParams(encodeAppState({ ...DEFAULTS, mode: "flows" })).get("mode")).toBe("flows");
  });

  it("round-trips every mode", () => {
    for (const mode of ["infrastructure", "flows", "scenarios"] as const) {
      const state: AppState = { ...DEFAULTS, mode, year: 2021, commodity: "gas" };
      expect(decode(encodeAppState(state))).toEqual(state);
    }
  });

  it("missing or unknown mode → Infrastructure, decoded against the defaults unchanged", () => {
    expect(decode("")).toEqual(DEFAULTS);
    expect(decode("mode=coal")).toEqual(DEFAULTS);
    expect(decode("mode=")).toEqual(DEFAULTS);
  });

  it("an old (pre-mode) URL decodes exactly as encoded", () => {
    const decoded = decode("year=2015&commodity=gas&scenario=hormuz&layers=reserves,lng_terminals");
    expect(decoded).toEqual({
      mode: "infrastructure",
      year: 2015,
      commodity: "gas",
      scenario: "hormuz",
      scenario2: null,
      severity: 1,
      view: "importers",
      focus: null,
      layers: { ...ALL_OFF, reserves: true, lng_terminals: true },
    });
  });

  it("an explicit mode with no other params takes that mode's preset", () => {
    expect(decode("mode=flows")).toEqual(applyMode(DEFAULTS, "flows"));
    expect(decode("mode=scenarios")).toEqual(applyMode(DEFAULTS, "scenarios"));
  });

  it("explicit params win over the mode preset", () => {
    const decoded = decode("mode=flows&year=2012&commodity=oil&layers=reserves");
    expect(decoded.mode).toBe("flows");
    expect(decoded.year).toBe(2012);
    expect(decoded.commodity).toBe("oil");
    expect(decoded.layers).toEqual({ ...ALL_OFF, reserves: true });
    expect(decoded.layers).not.toEqual(MODE_LAYERS.flows);
  });

  it("an empty layers param means no layers, even under a mode preset", () => {
    expect(Object.values(decode("mode=flows&layers=").layers).some(Boolean)).toBe(false);
  });
});

describe("decodeAppState — focus", () => {
  const decode = (qs: string) => decodeAppState(new URLSearchParams(qs), DEFAULTS);

  it("is omitted from the querystring when null, so old links are byte-identical", () => {
    expect(encodeAppState(DEFAULTS)).toBe(
      "mode=infrastructure&year=2020&commodity=oil&layers=reserves%2Cbasins%2Cextraction%2Cpipelines%2Crefineries%2Cstorage%2Cports%2Cgas_pipelines%2Clng_terminals%2Clng_voyages",
    );
    expect(new URLSearchParams(encodeAppState(DEFAULTS)).has("focus")).toBe(false);
  });

  it("round-trips a focused country", () => {
    const state: AppState = { ...DEFAULTS, focus: "JPN" };
    expect(new URLSearchParams(encodeAppState(state)).get("focus")).toBe("JPN");
    expect(decode(encodeAppState(state))).toEqual(state);
  });

  it("upper-cases a hand-typed code", () => {
    expect(decode("focus=jpn").focus).toBe("JPN");
  });

  it("drops an unknown or malformed code", () => {
    for (const qs of ["focus=ZZZ", "focus=JP", "focus=JPNX", "focus=", "focus=S19"]) {
      expect(decode(qs).focus).toBeNull();
    }
  });

  // B1: a partner row can name a country with no 1:110m polygon. It is a real
  // selection — outlined as a ring at its anchor — so the link keeps it.
  it("keeps a polygon-less but anchored code", () => {
    expect(decode("focus=SGP").focus).toBe("SGP");
    expect(decode("focus=BHR").focus).toBe("BHR");
  });

  it("survives a mode preset: modes never clear a focus the URL carries", () => {
    expect(decode("mode=flows&focus=JPN").focus).toBe("JPN");
    expect(decode("mode=scenarios&focus=JPN").focus).toBe("JPN");
  });

  it("applyMode keeps the current focus", () => {
    const focused: AppState = { ...DEFAULTS, focus: "DEU" };
    for (const mode of ["infrastructure", "flows", "scenarios"] as const) {
      expect(applyMode(focused, mode).focus).toBe("DEU");
    }
  });
});

describe("encodeView / decodeView", () => {
  const view = (qs: string): MapView => decodeView(new URLSearchParams(qs), DEFAULT_VIEW);

  it("encodes lon, lat, z to two decimals", () => {
    const params = new URLSearchParams(encodeView({ lon: 12.34567, lat: -45.6789, zoom: 3.14159 }));
    expect(params.get("lon")).toBe("12.35");
    expect(params.get("lat")).toBe("-45.68");
    expect(params.get("z")).toBe("3.14");
  });

  it("drops trailing zeros and negative zero", () => {
    const params = new URLSearchParams(encodeView({ lon: -0.001, lat: 25, zoom: 2 }));
    expect(params.get("lon")).toBe("0");
    expect(params.get("lat")).toBe("25");
    expect(params.get("z")).toBe("2");
  });

  it("round-trips a view (at URL precision)", () => {
    const original: MapView = { lon: 56.25, lat: 26.57, zoom: 5.5 };
    expect(view(encodeView(original))).toEqual(original);
  });

  it("falls back to the default view when params are missing", () => {
    expect(view("year=2020")).toEqual(DEFAULT_VIEW);
  });

  it("falls back per param for garbage values", () => {
    expect(view("lon=banana&lat=10&z=")).toEqual({ lon: DEFAULT_VIEW.lon, lat: 10, zoom: DEFAULT_VIEW.zoom });
    expect(view("lon=Infinity&lat=NaN&z=abc")).toEqual(DEFAULT_VIEW);
  });

  it("clamps zoom to the map's range", () => {
    expect(view("z=99").zoom).toBe(MAX_ZOOM);
    expect(view("z=-3").zoom).toBe(MIN_ZOOM);
  });

  it("clamps latitude to the Web-Mercator limit", () => {
    expect(view("lat=90").lat).toBeCloseTo(MAX_LAT, 2);
    expect(view("lat=-1000").lat).toBeCloseTo(-MAX_LAT, 2);
  });

  it("wraps longitude into [-180, 180)", () => {
    expect(view("lon=190").lon).toBe(-170);
    expect(view("lon=-190").lon).toBe(170);
    expect(view("lon=720").lon).toBe(0);
  });
});

describe("encodeUrlState", () => {
  it("round-trips app state and view through one querystring", () => {
    const app: AppState = { ...DEFAULTS, year: 2023, scenario: "hormuz" };
    const v: MapView = { lon: -100.5, lat: 40.25, zoom: 4 };
    const params = new URLSearchParams(encodeUrlState(app, v));
    expect(decodeAppState(params, DEFAULTS)).toEqual(app);
    expect(decodeView(params, DEFAULT_VIEW)).toEqual(v);
  });
});

describe("decodeAppState: scenario must model the commodity (A1)", () => {
  const decodeQs = (qs: string) => decodeAppState(new URLSearchParams(qs), DEFAULTS);

  it("drops a scenario the commodity does not support", () => {
    // `druzhba` is oil-only; on the gas axis there are no `druzhba_lng` route
    // rows at all, so the pair could only ever render a confident 0 %.
    expect(decodeQs("scenario=druzhba&commodity=gas").scenario).toBeNull();
    expect(decodeQs("scenario=btc&commodity=gas").scenario).toBeNull();
    expect(decodeQs("scenario=keystone&commodity=gas").scenario).toBeNull();
  });

  it("keeps a scenario that does model the commodity", () => {
    expect(decodeQs("scenario=hormuz&commodity=gas").scenario).toBe("hormuz");
    expect(decodeQs("scenario=malacca&commodity=gas").scenario).toBe("malacca");
    expect(decodeQs("scenario=druzhba&commodity=oil").scenario).toBe("druzhba");
    expect(decodeQs("scenario=druzhba").scenario).toBe("druzhba");
  });
});
