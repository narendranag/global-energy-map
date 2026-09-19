import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { SearchBox } from "@/components/search/SearchBox";
import { DEFAULT_APP_STATE } from "@/lib/modes";
import { resetSearchHighlightForTests, setSearchHighlight, useSearchHighlight } from "@/lib/search/highlight";
import type { SearchItem } from "@/lib/search/types";
import { adoptAppStore, resetAppStoreForTests } from "@/lib/state/store";

/**
 * A5: the search highlight ring is a transient module-level marker
 * (`src/lib/search/highlight.ts`), not React state, so nothing forces it to
 * clear on its own — these are the three ways it must, each pinned here
 * because none is covered by the DOM-visible assertions in
 * tests/e2e/search.spec.ts (the ring itself is a deck.gl canvas draw).
 */

const JAPAN: SearchItem = {
  id: "country:JPN",
  name: "Japan",
  kind: "country",
  countryIso3: "JPN",
  operator: null,
  iso3: "JPN",
  nameKey: "japan",
  iso3Key: "jpn",
  target: { action: "country", iso3: "JPN" },
};

const FUTTSU: SearchItem = {
  id: "asset:futtsu",
  name: "Futtsu LNG Terminal",
  kind: "lng_import",
  countryIso3: "JPN",
  operator: null,
  iso3: null,
  nameKey: "futtsu lng terminal",
  iso3Key: null,
  target: { action: "flyTo", lon: 139.82, lat: 35.35, zoom: 6, layerKey: "lng_terminals" },
};

vi.mock("@/lib/search/useSearchIndex", () => ({
  useSearchIndex: () => ({ items: [JAPAN, FUTTSU], loading: false }),
}));

// fitCountry awaits countryBounds(), which fetches countries.geojson; not
// under test here, so make it resolve immediately without a network call.
vi.mock("@/lib/geo/bounds", () => ({
  countryBounds: () => Promise.resolve(null),
}));

afterEach(() => {
  cleanup();
  resetAppStoreForTests();
  resetSearchHighlightForTests();
});

describe("SearchBox clears its search highlight", () => {
  it("when the query is backspaced to empty", () => {
    adoptAppStore(DEFAULT_APP_STATE, "");
    setSearchHighlight({ id: FUTTSU.id, lon: FUTTSU.target.action === "flyTo" ? FUTTSU.target.lon : 0, lat: 0 });
    const highlight = renderHook(() => useSearchHighlight());
    expect(highlight.result.current).not.toBeNull();

    render(<SearchBox />);
    const input = screen.getByRole("combobox", { name: "Search the map" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Futtsu" } });
    expect(highlight.result.current).not.toBeNull(); // still set while typing

    fireEvent.change(input, { target: { value: "" } });
    expect(highlight.result.current).toBeNull();
  });

  it("when a country is picked by a means other than this search box", async () => {
    const store = adoptAppStore(DEFAULT_APP_STATE, "");
    render(<SearchBox />);
    setSearchHighlight({ id: FUTTSU.id, lon: 139.82, lat: 35.35 });
    const highlight = renderHook(() => useSearchHighlight());
    expect(highlight.result.current).not.toBeNull();

    // Simulates a map click (CountryPickLayer/page.tsx), not a search commit.
    store.patch({ focus: "DEU" });
    await waitFor(() => {
      expect(highlight.result.current).toBeNull();
    });
  });

  it("on unmount", () => {
    adoptAppStore(DEFAULT_APP_STATE, "");
    const { unmount } = render(<SearchBox />);
    setSearchHighlight({ id: FUTTSU.id, lon: 139.82, lat: 35.35 });
    expect(useSearchHighlight).toBeDefined();
    unmount();
    const highlight = renderHook(() => useSearchHighlight());
    expect(highlight.result.current).toBeNull();
  });

  it("selecting the country result itself still clears it (existing behaviour, guarded)", async () => {
    adoptAppStore(DEFAULT_APP_STATE, "");
    render(<SearchBox />);
    const input = screen.getByRole("combobox", { name: "Search the map" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Japan" } });
    const option = await screen.findByRole("option", { name: /Japan/ });
    setSearchHighlight({ id: "stale", lon: 1, lat: 1 });
    fireEvent.click(option);
    const highlight = renderHook(() => useSearchHighlight());
    await waitFor(() => {
      expect(highlight.result.current).toBeNull();
    });
  });
});
