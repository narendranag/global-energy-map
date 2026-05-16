import { describe, it, expect } from "vitest";
import { computeLngImportImpacts } from "@/lib/scenarios/lng";
import type { LngImportRow } from "@/lib/scenarios/types";

const flowsByImporter = new Map([
  // JPN imports: 50 from QAT, 30 from AUS, 20 from USA
  ["JPN", [
    { iso3: "QAT", qty: 50 },
    { iso3: "AUS", qty: 30 },
    { iso3: "USA", qty: 20 },
  ]],
  // KOR imports: 60 from QAT, 40 from USA
  ["KOR", [
    { iso3: "QAT", qty: 60 },
    { iso3: "USA", qty: 40 },
  ]],
  // GBR imports: 70 from QAT, 30 from USA  (no terminals fixture — should not appear)
  ["GBR", [
    { iso3: "QAT", qty: 70 },
    { iso3: "USA", qty: 30 },
  ]],
]);

// Hormuz-LNG: QAT → all importers, share=1.0
const lookupShare = (exporter: string) =>
  exporter === "QAT" ? 1.0 : 0;

describe("computeLngImportImpacts", () => {
  it("attributes country imports by terminal capacity share", () => {
    // JPN has 2 terminals: 75 mtpa + 25 mtpa = 100 total → 75% / 25%
    const terms: LngImportRow[] = [
      { asset_id: "JPN-T1", country_iso3: "JPN", capacity: 75 },
      { asset_id: "JPN-T2", country_iso3: "JPN", capacity: 25 },
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    const t1 = out.find((t) => t.asset_id === "JPN-T1");
    const t2 = out.find((t) => t.asset_id === "JPN-T2");
    expect(t1).toBeDefined();
    expect(t2).toBeDefined();
    if (!t1) throw new Error("JPN-T1 not found");
    if (!t2) throw new Error("JPN-T2 not found");
    // T1 gets 75% of JPN's 100 total → 75, of which 50%*0.75=37.5 is from QAT
    expect(t1.atRiskQty).toBeCloseTo(50 * 0.75, 5);
    expect(t1.shareAtRisk).toBeCloseTo(0.5, 5); // 37.5 / (100 * 0.75)
    expect(t2.atRiskQty).toBeCloseTo(50 * 0.25, 5);
    expect(t2.shareAtRisk).toBeCloseTo(0.5, 5);
  });

  it("falls back to uniform-within-country when all capacities are zero", () => {
    const terms: LngImportRow[] = [
      { asset_id: "KOR-T1", country_iso3: "KOR", capacity: 0 },
      { asset_id: "KOR-T2", country_iso3: "KOR", capacity: 0 },
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    // Each terminal gets 50% of KOR's 100 total → 50; QAT at risk: 60 * 0.5 = 30
    expect(out[0].atRiskQty).toBeCloseTo(30, 5);
    expect(out[0].shareAtRisk).toBeCloseTo(0.6, 5);  // 30/50
    expect(out[1].atRiskQty).toBeCloseTo(30, 5);
  });

  it("returns top-5 sources sorted by attributed qty desc", () => {
    const terms: LngImportRow[] = [
      { asset_id: "JPN-T1", country_iso3: "JPN", capacity: 100 },
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    expect(out[0].topSources.map((s) => s.iso3)).toEqual(["QAT", "AUS", "USA"]);
  });

  it("yields shareAtRisk=0 for a terminal in a country with no imports", () => {
    const terms: LngImportRow[] = [
      { asset_id: "USA-T1", country_iso3: "USA", capacity: 20 },  // net-exporter case
    ];
    const out = computeLngImportImpacts({ lngImports: terms, flowsByImporter, lookupShare });
    expect(out[0].atRiskQty).toBe(0);
    expect(out[0].shareAtRisk).toBe(0);
    expect(out[0].topSources).toEqual([]);
  });
});
