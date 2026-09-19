import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type {
  DisruptionRouteRow,
  ImporterImpact,
  LngImportRow,
  RefineryRow,
  ScenarioResult,
  TradeFlowRow,
} from "@/lib/scenarios/types";

/**
 * The S5 contract: adding severity / combined scenarios / the exporter view /
 * importer-wide wildcards must not move a single existing number. This pins
 * the legacy fields of a mixed oil result (importers + refineries) and a gas
 * result (importers + LNG terminals) computed from inputs that use none of
 * the new features, and compares them exactly.
 */

const TRADE: readonly TradeFlowRow[] = [
  { year: 2024, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 },
  { year: 2024, importer_iso3: "IND", exporter_iso3: "IRQ", qty: 50 },
  { year: 2024, importer_iso3: "IND", exporter_iso3: "USA", qty: 25 },
  { year: 2024, importer_iso3: "CHN", exporter_iso3: "SAU", qty: 200 },
  { year: 2024, importer_iso3: "CHN", exporter_iso3: "RUS", qty: 300 },
  // wrong year — must be ignored by every pass
  { year: 2023, importer_iso3: "IND", exporter_iso3: "SAU", qty: 999 },
];

const ROUTES: readonly DisruptionRouteRow[] = [
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: null, share: 0.88 },
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "IRQ", importer_iso3: null, share: 1 },
  // a pair row that overrides the wildcard, including the share-0 intra-Gulf case
  { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: "BHR", share: 0 },
  // another scenario's rows must be filtered out
  { disruption_id: "cpc", kind: "pipeline", exporter_iso3: "KAZ", importer_iso3: null, share: 0.8 },
];

const REFINERIES: readonly RefineryRow[] = [
  { asset_id: "r1", country_iso3: "IND", capacity: 300 },
  { asset_id: "r2", country_iso3: "IND", capacity: 100 },
  { asset_id: "r3", country_iso3: "CHN", capacity: 0 },
];

const TERMINALS: readonly LngImportRow[] = [
  { asset_id: "t1", country_iso3: "IND", capacity: 10 },
  { asset_id: "t2", country_iso3: "CHN", capacity: 30 },
].map((t) => ({ ...t, name: t.asset_id }));

/** The result fields that existed before S5, deep-compared against the fixture. */
function legacyFields(r: ScenarioResult): unknown {
  const importer = (i: ImporterImpact) => ({
    iso3: i.iso3,
    totalQty: i.totalQty,
    atRiskQty: i.atRiskQty,
    shareAtRisk: i.shareAtRisk,
  });
  return {
    scenarioId: r.scenarioId,
    commodity: r.commodity,
    year: r.year,
    byImporter: r.byImporter.map(importer),
    rankedImporters: r.rankedImporters.map(importer),
    byRefinery: r.byRefinery,
    rankedRefineries: r.rankedRefineries,
    byLngImport: r.byLngImport,
    rankedLngImports: r.rankedLngImports,
  };
}

describe("engine regression — pre-S5 results are unchanged", () => {
  it("oil: importers and refineries match the pinned fixture", () => {
    const r = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2024,
      tradeFlows: TRADE,
      routes: ROUTES,
      refineries: REFINERIES,
    });
    expect(legacyFields(r)).toEqual({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2024,
      byImporter: [
        { iso3: "IND", totalQty: 175, atRiskQty: 138, shareAtRisk: 138 / 175 },
        { iso3: "CHN", totalQty: 500, atRiskQty: 176, shareAtRisk: 176 / 500 },
      ],
      rankedImporters: [
        { iso3: "CHN", totalQty: 500, atRiskQty: 176, shareAtRisk: 176 / 500 },
        { iso3: "IND", totalQty: 175, atRiskQty: 138, shareAtRisk: 138 / 175 },
      ],
      byRefinery: [
        {
          asset_id: "r1",
          iso3: "IND",
          capacity: 300,
          atRiskQty: 103.5,
          shareAtRisk: 138 / 175,
          topSources: [
            { iso3: "SAU", qty: 75 },
            { iso3: "IRQ", qty: 37.5 },
            { iso3: "USA", qty: 18.75 },
          ],
        },
        {
          asset_id: "r2",
          iso3: "IND",
          capacity: 100,
          atRiskQty: 34.5,
          shareAtRisk: 138 / 175,
          topSources: [
            { iso3: "SAU", qty: 25 },
            { iso3: "IRQ", qty: 12.5 },
            { iso3: "USA", qty: 6.25 },
          ],
        },
        {
          asset_id: "r3",
          iso3: "CHN",
          capacity: 0,
          atRiskQty: 176,
          shareAtRisk: 176 / 500,
          topSources: [
            { iso3: "RUS", qty: 300 },
            { iso3: "SAU", qty: 200 },
          ],
        },
      ],
      rankedRefineries: [
        expect.objectContaining({ asset_id: "r3" }),
        expect.objectContaining({ asset_id: "r1" }),
        expect.objectContaining({ asset_id: "r2" }),
      ],
      byLngImport: [],
      rankedLngImports: [],
    });
  });

  it("gas: LNG terminals match the pinned fixture (capacity proxy, no voyages)", () => {
    const r = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2024,
      tradeFlows: TRADE,
      routes: ROUTES,
      lngImports: TERMINALS,
    });
    expect(r.byLngImport).toEqual([
      {
        asset_id: "t1",
        iso3: "IND",
        capacity: 10,
        name: "t1",
        atRiskQty: 138,
        shareAtRisk: 138 / 175,
        topSources: [
          { iso3: "SAU", qty: 100 },
          { iso3: "IRQ", qty: 50 },
          { iso3: "USA", qty: 25 },
        ],
        dataSource: "baci",
        coverage: "capacity-proxy",
      },
      {
        asset_id: "t2",
        iso3: "CHN",
        capacity: 30,
        name: "t2",
        atRiskQty: 176,
        shareAtRisk: 176 / 500,
        topSources: [
          { iso3: "RUS", qty: 300 },
          { iso3: "SAU", qty: 200 },
        ],
        dataSource: "baci",
        coverage: "capacity-proxy",
      },
    ]);
  });

  it("the share-0 pair row still beats the exporter wildcard", () => {
    const r = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "oil",
      year: 2024,
      tradeFlows: [{ year: 2024, importer_iso3: "BHR", exporter_iso3: "SAU", qty: 10 }],
      routes: ROUTES,
    });
    expect(r.byImporter[0]?.atRiskQty).toBe(0);
  });
});
