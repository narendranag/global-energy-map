import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptAppStore,
  createAppStore,
  peekAppStore,
  resetAppStoreForTests,
  URL_WRITE_DEBOUNCE_MS,
} from "@/lib/state/store";
import { DEFAULT_VIEW } from "@/lib/state/view";
import type { AppState } from "@/lib/url-state/encode";
import type { LayerState } from "@/components/layers/LayerPanel";

const LAYERS: LayerState = {
  reserves: true,
  basins: true,
  extraction: true,
  pipelines: true,
  refineries: true,
  storage: true,
  ports: true,
  gas_pipelines: true,
  lng_terminals: true,
  lng_voyages: false,
};

const DEFAULTS: AppState = { mode: "infrastructure", year: 2020, commodity: "oil", scenario: null, layers: LAYERS };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetAppStoreForTests();
});

describe("createAppStore — initial state", () => {
  it("starts from defaults with no querystring", () => {
    const store = createAppStore({ defaults: DEFAULTS });
    expect(store.getApp()).toEqual(DEFAULTS);
    expect(store.getView()).toEqual(DEFAULT_VIEW);
  });

  it("decodes app state and view from the querystring (with or without '?')", () => {
    for (const search of ["?year=2015&commodity=gas&layers=reserves&lon=10&lat=20&z=3", "year=2015&commodity=gas&layers=reserves&lon=10&lat=20&z=3"]) {
      const store = createAppStore({ defaults: DEFAULTS, search });
      expect(store.getApp().year).toBe(2015);
      expect(store.getApp().commodity).toBe("gas");
      expect(store.getApp().layers.basins).toBe(false);
      expect(store.getView()).toEqual({ lon: 10, lat: 20, zoom: 3 });
    }
  });
});

describe("patch semantics", () => {
  it("merges top-level fields and layers per key", () => {
    const store = createAppStore({ defaults: DEFAULTS });
    store.patch({ year: 2010 });
    store.patch({ layers: { ...LAYERS, ports: false } });
    expect(store.getApp()).toEqual({ ...DEFAULTS, year: 2010, layers: { ...LAYERS, ports: false } });
  });

  it("composes consecutive patches synchronously (no lost update)", () => {
    const store = createAppStore({ defaults: DEFAULTS });
    store.patch({ commodity: "gas" });
    store.patch({ scenario: "hormuz" });
    expect(store.getApp().commodity).toBe("gas");
    expect(store.getApp().scenario).toBe("hormuz");
  });

  it("notifies subscribers once per effective change, with a new snapshot", () => {
    const store = createAppStore({ defaults: DEFAULTS });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getApp();
    store.patch({ year: 2011 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getApp()).not.toBe(before);
    unsubscribe();
    store.patch({ year: 2012 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores a no-op patch (same snapshot, no notify)", () => {
    const store = createAppStore({ defaults: DEFAULTS });
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getApp();
    store.patch({ year: DEFAULTS.year, layers: { ...LAYERS } });
    expect(listener).not.toHaveBeenCalled();
    expect(store.getApp()).toBe(before);
  });

  it("setView normalises and leaves the AppState snapshot untouched", () => {
    const store = createAppStore({ defaults: DEFAULTS });
    const app = store.getApp();
    store.setView({ lon: 200.123, lat: 89, zoom: 12 });
    expect(store.getView()).toEqual({ lon: -159.88, lat: 85.05, zoom: 8 });
    expect(store.getApp()).toBe(app);
  });
});

describe("debounced URL writes", () => {
  it("collapses a burst of changes into one write of the final state", () => {
    const writeSearch = vi.fn();
    const store = createAppStore({ defaults: DEFAULTS, writeSearch });
    for (const year of [2021, 2022, 2023]) {
      store.patch({ year });
      vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS - 50);
    }
    expect(writeSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(writeSearch).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(writeSearch.mock.calls[0]?.[0] as string);
    expect(params.get("year")).toBe("2023");
    expect(params.get("lon")).toBe(String(DEFAULT_VIEW.lon));
    expect(params.get("z")).toBe(String(DEFAULT_VIEW.zoom));
  });

  it("includes the latest view", () => {
    const writeSearch = vi.fn();
    const store = createAppStore({ defaults: DEFAULTS, writeSearch });
    store.setView({ lon: 56.3, lat: 26.6, zoom: 5 });
    vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS);
    const params = new URLSearchParams(writeSearch.mock.calls[0]?.[0] as string);
    expect([params.get("lon"), params.get("lat"), params.get("z")]).toEqual(["56.3", "26.6", "5"]);
  });

  it("does not write for no-op changes", () => {
    const writeSearch = vi.fn();
    const store = createAppStore({ defaults: DEFAULTS, writeSearch });
    store.patch({ year: DEFAULTS.year });
    store.setView(DEFAULT_VIEW);
    vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS * 2);
    expect(writeSearch).not.toHaveBeenCalled();
  });

  it("flush writes immediately; cancel drops the pending write", () => {
    const writeSearch = vi.fn();
    const store = createAppStore({ defaults: DEFAULTS, writeSearch });
    store.patch({ year: 2001 });
    store.flush();
    expect(writeSearch).toHaveBeenCalledTimes(1);
    store.patch({ year: 2002 });
    store.cancel();
    vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS * 2);
    expect(writeSearch).toHaveBeenCalledTimes(1);
  });

  it("reset re-decodes silently and drops a pending write", () => {
    const writeSearch = vi.fn();
    const listener = vi.fn();
    const store = createAppStore({ defaults: DEFAULTS, writeSearch });
    store.subscribe(listener);
    store.patch({ year: 2001 });
    listener.mockClear();
    store.reset("?year=1999&z=4");
    vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS * 2);
    expect(store.getApp().year).toBe(1999);
    expect(store.getView().zoom).toBe(4);
    expect(listener).not.toHaveBeenCalled();
    expect(writeSearch).not.toHaveBeenCalled();
  });
});

describe("browser singleton", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("adoptAppStore seeds from the querystring and is reachable via peekAppStore", () => {
    expect(peekAppStore()).toBeNull();
    const store = adoptAppStore(DEFAULTS, "year=2005&lon=1&lat=2&z=3");
    expect(peekAppStore()).toBe(store);
    expect(store.getApp().year).toBe(2005);
    expect(store.getView()).toEqual({ lon: 1, lat: 2, zoom: 3 });
  });

  it("re-adopting with the same defaults reuses and re-decodes the same store", () => {
    const a = adoptAppStore(DEFAULTS, "year=2005");
    const b = adoptAppStore(DEFAULTS, "year=2006");
    expect(b).toBe(a);
    expect(b.getApp().year).toBe(2006);
  });

  it("writes via history.replaceState after the debounce, keeping the path", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const store = adoptAppStore(DEFAULTS, "");
    store.patch({ year: 2023 });
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/");
    expect(new URLSearchParams(window.location.search).get("year")).toBe("2023");
    replace.mockRestore();
  });

  it("does not rewrite the URL after navigating to another path", () => {
    const store = adoptAppStore(DEFAULTS, "");
    store.patch({ year: 2023 });
    window.history.pushState(null, "", "/about");
    vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS);
    expect(window.location.pathname).toBe("/about");
    expect(window.location.search).toBe("");
  });
});
