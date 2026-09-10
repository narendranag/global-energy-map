import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMapView } from "@/lib/state";
import { adoptAppStore, resetAppStoreForTests } from "@/lib/state/store";
import { DEFAULT_VIEW } from "@/lib/state/view";
import { DEFAULT_APP_STATE } from "@/lib/modes";

afterEach(() => {
  resetAppStoreForTests();
});

describe("useMapView", () => {
  it("returns DEFAULT_VIEW before a page has adopted the store", () => {
    const { result } = renderHook(() => useMapView());
    expect(result.current).toEqual(DEFAULT_VIEW);
  });

  it("reads the view decoded from the URL and follows setView", () => {
    const store = adoptAppStore(DEFAULT_APP_STATE, "lon=10&lat=20&z=3");
    const { result } = renderHook(() => useMapView());
    expect(result.current).toEqual({ lon: 10, lat: 20, zoom: 3 });
    act(() => {
      store.setView({ lon: 10, lat: 20, zoom: 4.5 });
    });
    expect(result.current.zoom).toBe(4.5);
    store.cancel();
  });

  it("does not re-render on app-state patches", () => {
    const store = adoptAppStore(DEFAULT_APP_STATE, "");
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useMapView();
    });
    const before = renders;
    act(() => {
      store.patch({ year: 2010 });
    });
    expect(renders).toBe(before);
    store.cancel();
  });
});
