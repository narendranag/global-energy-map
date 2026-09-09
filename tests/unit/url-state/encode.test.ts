import { describe, it, expect } from "vitest";
import { encodeAppState, decodeAppState, type AppState } from "@/lib/url-state/encode";
import type { LayerState } from "@/components/layers/LayerPanel";

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

const DEFAULTS: AppState = {
  year: 2020,
  commodity: "oil",
  scenario: null,
  layers: ALL_ON,
};

describe("encodeAppState", () => {
  it("encodes a non-default state to a querystring", () => {
    const qs = encodeAppState({
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

  it("round-trips with lng_voyages flag toggled on", () => {
    const state: AppState = {
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
