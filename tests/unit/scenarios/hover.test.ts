import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearScenarioHover,
  getScenarioHover,
  hoveredAssetId,
  hoveredIso3,
  resetScenarioHoverForTests,
  setMapHoverCountry,
  setScenarioHover,
  subscribeScenarioHover,
} from "@/components/scenarios/hover";
import {
  HOVER_ASSET_LAYER_ID,
  HOVER_COUNTRY_LAYER_ID,
  buildScenarioHoverLayers,
} from "@/components/scenarios/hover-layers";
import type { CountryCollection } from "@/lib/geo/countries";

afterEach(() => {
  resetScenarioHoverForTests();
});

const COUNTRIES: CountryCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso3: "JPN", name: "Japan" },
      geometry: { type: "Polygon", coordinates: [[[130, 31], [146, 31], [146, 45], [130, 45], [130, 31]]] },
    },
    {
      type: "Feature",
      properties: { iso3: "KOR", name: "South Korea" },
      geometry: { type: "Polygon", coordinates: [[[126, 34], [130, 34], [130, 38], [126, 38], [126, 34]]] },
    },
  ],
};

const ASSETS = [{ asset_id: "R1", lon: 10, lat: 20 }];

describe("the hover store", () => {
  it("notifies subscribers when what is pointed at changes", () => {
    const seen = vi.fn();
    const off = subscribeScenarioHover(seen);
    setScenarioHover({ kind: "country", iso3: "JPN" });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getScenarioHover()).toEqual({ kind: "country", iso3: "JPN" });
    off();
  });

  it("does nothing when the same thing is pointed at again", () => {
    // The map fires a hover per pointer event; re-notifying would rebuild the
    // whole layer stack on every mouse move.
    const seen = vi.fn();
    setScenarioHover({ kind: "country", iso3: "JPN" });
    const off = subscribeScenarioHover(seen);
    setScenarioHover({ kind: "country", iso3: "JPN" });
    setMapHoverCountry("JPN");
    expect(seen).not.toHaveBeenCalled();
    off();
  });

  it("only clears a hover the caller still owns", () => {
    // A row's pointer-leave can land after the next row's pointer-enter.
    setScenarioHover({ kind: "country", iso3: "JPN" });
    setScenarioHover({ kind: "country", iso3: "KOR" });
    clearScenarioHover({ kind: "country", iso3: "JPN" });
    expect(getScenarioHover()).toEqual({ kind: "country", iso3: "KOR" });
    clearScenarioHover({ kind: "country", iso3: "KOR" });
    expect(getScenarioHover()).toBeNull();
  });

  it("distinguishes a country from an asset", () => {
    setScenarioHover({ kind: "asset", assetId: "R1" });
    expect(hoveredIso3(getScenarioHover())).toBeNull();
    expect(hoveredAssetId(getScenarioHover())).toBe("R1");
    setScenarioHover({ kind: "country", iso3: "JPN" });
    expect(hoveredAssetId(getScenarioHover())).toBeNull();
    expect(hoveredIso3(getScenarioHover())).toBe("JPN");
  });

  it("clears when the map reports a hover that is not a country", () => {
    setScenarioHover({ kind: "country", iso3: "JPN" });
    setMapHoverCountry(null);
    expect(getScenarioHover()).toBeNull();
  });
});

describe("buildScenarioHoverLayers", () => {
  it("draws nothing when nothing is pointed at", () => {
    expect(buildScenarioHoverLayers(null, COUNTRIES, ASSETS)).toEqual([]);
  });

  it("highlights only the hovered country", () => {
    const layers = buildScenarioHoverLayers({ kind: "country", iso3: "JPN" }, COUNTRIES, ASSETS);
    expect(layers.map((l) => l.id)).toEqual([HOVER_COUNTRY_LAYER_ID]);
    const data = layers[0]?.props.data as CountryCollection;
    expect(data.features.map((f) => f.properties.iso3)).toEqual(["JPN"]);
  });

  it("rings the hovered asset", () => {
    const layers = buildScenarioHoverLayers({ kind: "asset", assetId: "R1" }, COUNTRIES, ASSETS);
    expect(layers.map((l) => l.id)).toEqual([HOVER_ASSET_LAYER_ID]);
    expect(layers[0]?.props.data).toEqual([{ lon: 10, lat: 20 }]);
  });

  it("is never pickable — a highlight must not become a hit target", () => {
    for (const hover of [
      { kind: "country", iso3: "JPN" },
      { kind: "asset", assetId: "R1" },
    ] as const) {
      for (const l of buildScenarioHoverLayers(hover, COUNTRIES, ASSETS)) {
        expect(l.props.pickable).toBe(false);
      }
    }
  });

  it("draws nothing for a country or asset we have no geometry for", () => {
    expect(buildScenarioHoverLayers({ kind: "country", iso3: "ZZZ" }, COUNTRIES, ASSETS)).toEqual([]);
    expect(buildScenarioHoverLayers({ kind: "asset", assetId: "nope" }, COUNTRIES, ASSETS)).toEqual([]);
    expect(buildScenarioHoverLayers({ kind: "country", iso3: "JPN" }, null, ASSETS)).toEqual([]);
  });
});
