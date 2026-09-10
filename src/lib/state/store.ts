/**
 * App store: the single source of truth for `AppState` (year, commodity,
 * scenario, layers) and the map view (lon/lat/zoom).
 *
 * The URL is a *serialisation* of this store, not the store itself (R16):
 * changes land in memory synchronously and are mirrored to the address bar by
 * a debounced `history.replaceState` — no Next navigation, no RSC round-trip
 * per slider tick. React reads it through `useSyncExternalStore` (see
 * `useUrlState`); MapShell reads/writes the view imperatively.
 */
import {
  decodeAppState,
  decodeView,
  encodeUrlState,
  type AppState,
} from "@/lib/url-state/encode";
import { DEFAULT_VIEW, normalizeView, sameView, type MapView } from "./view";

export const URL_WRITE_DEBOUNCE_MS = 250;

export interface AppStoreOptions {
  readonly defaults: AppState;
  readonly defaultView?: MapView;
  /** Initial querystring, with or without the leading `?`. */
  readonly search?: string;
  /** Receives the full querystring (no `?`) after the debounce settles. */
  readonly writeSearch?: (search: string) => void;
  readonly debounceMs?: number;
}

export interface AppStore {
  readonly getApp: () => AppState;
  readonly getView: () => MapView;
  readonly subscribe: (listener: () => void) => () => void;
  /** Merge a partial AppState (`layers` merges per key). Schedules a URL write. */
  readonly patch: (patch: Partial<AppState>) => void;
  /** Replace the map view (normalised). Schedules a URL write. */
  readonly setView: (view: MapView) => void;
  /** Re-decode state from a querystring. Silent: no listeners, no URL write. */
  readonly reset: (search: string) => void;
  /** Write any pending URL change now. */
  readonly flush: () => void;
  /** Drop any pending URL write. */
  readonly cancel: () => void;
}

function sameApp(a: AppState, b: AppState): boolean {
  if (a.year !== b.year || a.commodity !== b.commodity || a.scenario !== b.scenario) {
    return false;
  }
  const keys = new Set([...Object.keys(a.layers), ...Object.keys(b.layers)]);
  for (const k of keys) {
    if (a.layers[k as keyof AppState["layers"]] !== b.layers[k as keyof AppState["layers"]]) {
      return false;
    }
  }
  return true;
}

export function createAppStore(options: AppStoreOptions): AppStore {
  const {
    defaults,
    defaultView = DEFAULT_VIEW,
    writeSearch,
    debounceMs = URL_WRITE_DEBOUNCE_MS,
  } = options;

  const listeners = new Set<() => void>();
  let app: AppState = defaults;
  let view: MapView = normalizeView(defaultView);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const decode = (search: string) => {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    app = decodeAppState(params, defaults);
    view = decodeView(params, defaultView);
  };
  decode(options.search ?? "");

  const notify = () => {
    for (const l of [...listeners]) l();
  };

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    if (timer === null) return;
    cancel();
    writeSearch?.(encodeUrlState(app, view));
  };

  const scheduleWrite = () => {
    if (!writeSearch) return;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      writeSearch(encodeUrlState(app, view));
    }, debounceMs);
  };

  return {
    getApp: () => app,
    getView: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    patch: (partial) => {
      const next: AppState = {
        ...app,
        ...partial,
        layers: { ...app.layers, ...(partial.layers ?? {}) },
      };
      if (sameApp(next, app)) return;
      app = next;
      notify();
      scheduleWrite();
    },
    setView: (nextView) => {
      const v = normalizeView(nextView);
      if (sameView(v, view)) return;
      view = v;
      notify();
      scheduleWrite();
    },
    reset: (search) => {
      cancel();
      decode(search);
    },
    flush,
    cancel,
  };
}

// ---------------------------------------------------------------------------
// Browser singleton
// ---------------------------------------------------------------------------

let browserStore: AppStore | null = null;
let browserDefaults: AppState | null = null;
/** Pathname the singleton was (re)initialised for; URL writes are pinned to it. */
let browserPathname = "/";

function writeBrowserSearch(search: string): void {
  // A write that lands after a client-side navigation away (e.g. to /about)
  // must not rewrite the new page's URL.
  if (window.location.pathname !== browserPathname) return;
  if (window.location.search === `?${search}`) return;
  // `null` state: Next (≥14.1) patches replaceState, merges its own router
  // state back in, and keeps useSearchParams in sync — without a navigation.
  window.history.replaceState(null, "", `${browserPathname}?${search}${window.location.hash}`);
}

/**
 * Called once per page mount (by `useUrlState`) with the page's defaults and
 * the current querystring. In the browser it (re)initialises the shared
 * singleton so MapShell can reach it; on the server it returns a throwaway
 * store so no state leaks across requests.
 */
export function adoptAppStore(defaults: AppState, search: string): AppStore {
  if (typeof window === "undefined") {
    return createAppStore({ defaults, search });
  }
  // Reuse (and silently re-decode) rather than replace the singleton: React
  // StrictMode runs the caller's initialiser twice, and two live stores would
  // race each other's URL writes.
  if (browserStore === null || browserDefaults !== defaults) {
    browserStore?.cancel();
    browserStore = createAppStore({ defaults, search, writeSearch: writeBrowserSearch });
    browserDefaults = defaults;
  } else {
    browserStore.reset(search);
  }
  browserPathname = window.location.pathname;
  return browserStore;
}

/** The browser store, if a page has adopted it (null on the server / before mount). */
export function peekAppStore(): AppStore | null {
  return browserStore;
}

/** Test hook: forget the browser singleton. */
export function resetAppStoreForTests(): void {
  browserStore?.cancel();
  browserStore = null;
  browserDefaults = null;
  browserPathname = "/";
}
