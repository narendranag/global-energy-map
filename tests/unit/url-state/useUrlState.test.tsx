import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { resetAppStoreForTests, URL_WRITE_DEBOUNCE_MS } from "@/lib/state/store";
// vi.mock below is hoisted above this import, so the hook sees the mock.
import { useUrlState } from "@/lib/url-state/useUrlState";
import type { AppState } from "@/lib/url-state/encode";
import type { LayerState } from "@/components/layers/LayerPanel";

const routerReplace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
}));

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
  window.history.replaceState(null, "", "/");
  routerReplace.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  resetAppStoreForTests();
});

describe("useUrlState", () => {
  it("returns state decoded from the querystring", () => {
    search = "year=2015&commodity=gas&layers=reserves";
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    const [state] = result.current;
    expect(state.year).toBe(2015);
    expect(state.commodity).toBe("gas");
    expect(state.layers.basins).toBe(false);
  });

  it("updates synchronously, composes setter calls, and never navigates", () => {
    search = "";
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    act(() => {
      result.current[1]({ commodity: "gas" });
      result.current[1]({ scenario: "hormuz" });
    });
    expect(result.current[0].commodity).toBe("gas");
    expect(result.current[0].scenario).toBe("hormuz");

    act(() => {
      vi.advanceTimersByTime(URL_WRITE_DEBOUNCE_MS);
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get("commodity")).toBe("gas");
    expect(params.get("scenario")).toBe("hormuz");
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("keeps a stable setter across renders", () => {
    search = "";
    const { result } = renderHook(() => useUrlState(DEFAULTS));
    const setter = result.current[1];
    act(() => {
      setter({ year: 2001 });
    });
    expect(result.current[1]).toBe(setter);
  });
});
