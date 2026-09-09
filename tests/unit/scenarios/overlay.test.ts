import { describe, it, expect } from "vitest";
import { lngVoyageImpactByTerminalName } from "@/components/scenarios/overlay";
import type { LngImportImpact, ScenarioResult } from "@/lib/scenarios/types";

function makeImpact(overrides: Partial<LngImportImpact> = {}): LngImportImpact {
  return {
    asset_id: "asset-1",
    iso3: "JPN",
    capacity: 10,
    name: "Sodegaura LNG Terminal",
    atRiskQty: 5,
    shareAtRisk: 0.5,
    topSources: [],
    dataSource: "lng-t3",
    coverage: "measured",
    ...overrides,
  };
}

function makeResult(byLngImport: readonly LngImportImpact[]): ScenarioResult {
  return {
    scenarioId: "hormuz",
    commodity: "gas",
    year: 2023,
    byImporter: [],
    rankedImporters: [],
    byRefinery: [],
    rankedRefineries: [],
    byLngImport,
    rankedLngImports: [...byLngImport],
  };
}

describe("lngVoyageImpactByTerminalName", () => {
  it("keys the map by terminal name (matching LngVoyageRow.to_terminal), not asset_id", () => {
    const impact = makeImpact();
    const map = lngVoyageImpactByTerminalName(makeResult([impact]));
    expect(map).toBeDefined();
    expect(map?.get(impact.name)).toBe(impact);
    expect(map?.get(impact.asset_id)).toBeUndefined();
  });

  it("returns undefined for a null scenario", () => {
    expect(lngVoyageImpactByTerminalName(null)).toBeUndefined();
  });

  it("returns undefined for a scenario with an empty byLngImport", () => {
    expect(lngVoyageImpactByTerminalName(makeResult([]))).toBeUndefined();
  });
});
