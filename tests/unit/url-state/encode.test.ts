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
};

const DEFAULTS: AppState = {
  mode: "infrastructure",
  year: 2020,
  commodity: "oil",
  scenario: null,
  layers: ALL_ON,
};

describe("encodeAppState", () => {
  it("encodes a non-default state to a querystring", () => {
    const qs = encodeAppState({
      mode: "infrastructure",
      year: 2015,
      commodity: "gas",
      scenario: "hormuz",
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
