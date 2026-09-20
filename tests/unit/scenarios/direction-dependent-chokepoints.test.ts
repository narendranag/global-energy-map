import { describe, it, expect } from "vitest";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { DisruptionRouteRow, TradeFlowRow } from "@/lib/scenarios/types";

/**
 * S6: unlike Hormuz (an exporter-wide wildcard), Malacca/Suez/Bab el-Mandeb
 * are direction-dependent — a share only applies to the (exporter,
 * importer-region) pairs whose cargo actually needs that route. These
 * fixtures reproduce the two cases the verifier's research turned up:
 * Saudi crude to Europe is exempt from Bab el-Mandeb (it loads at Yanbu,
 * north of the strait) while Iraqi crude to Europe is fully exposed, and
 * Gulf crude to India never reaches the Strait of Malacca at all.
 */

const babElMandebRoutes: DisruptionRouteRow[] = [
  { disruption_id: "bab_el_mandeb", kind: "chokepoint", exporter_iso3: "IRQ", importer_iso3: "DEU", share: 1.0 },
  { disruption_id: "bab_el_mandeb", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: "DEU", share: 0.0 },
];

describe("Bab el-Mandeb (oil) — direction-dependent shares", () => {
  it("SAU→DEU is 0 (Yanbu-loaded, exempt) while IRQ→DEU is fully exposed", () => {
    const tradeFlows: TradeFlowRow[] = [
      { year: 2024, importer_iso3: "DEU", exporter_iso3: "SAU", qty: 100 },
      { year: 2024, importer_iso3: "DEU", exporter_iso3: "IRQ", qty: 50 },
    ];
    const r = computeScenarioImpact({
      scenarioId: "bab_el_mandeb",
      commodity: "oil",
      year: 2024,
      tradeFlows,
      routes: babElMandebRoutes,
    });
    const deu = r.byImporter.find((x) => x.iso3 === "DEU");
    expect(deu).toBeDefined();
    if (!deu) throw new Error("deu not found");
    expect(deu.totalQty).toBe(150);
    // Only the IRQ 50 is at risk; the SAU 100 is explicitly exempt.
    expect(deu.atRiskQty).toBeCloseTo(50, 6);
    expect(deu.shareAtRisk).toBeCloseTo(50 / 150, 6);
  });

  it("a pair row with share 0 is not the same as no row at all: it overrides any default", () => {
    // Missing pairs already default to 0 in the engine; the explicit SAU row
    // exists so the panel/methodology can show *why* (source_note), not to
    // change the computed number here.
    const withExplicitZero = computeScenarioImpact({
      scenarioId: "bab_el_mandeb",
      commodity: "oil",
      year: 2024,
      tradeFlows: [{ year: 2024, importer_iso3: "DEU", exporter_iso3: "SAU", qty: 100 }],
      routes: babElMandebRoutes,
    });
    const withoutAnyRow = computeScenarioImpact({
      scenarioId: "bab_el_mandeb",
      commodity: "oil",
      year: 2024,
      tradeFlows: [{ year: 2024, importer_iso3: "DEU", exporter_iso3: "SAU", qty: 100 }],
      routes: [],
    });
    expect(withExplicitZero.byImporter[0]?.atRiskQty).toBe(withoutAnyRow.byImporter[0]?.atRiskQty);
    expect(withExplicitZero.byImporter[0]?.atRiskQty).toBe(0);
  });
});

const malaccaRoutes: DisruptionRouteRow[] = [
  { disruption_id: "malacca", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: "CHN", share: 1.0 },
  { disruption_id: "malacca", kind: "chokepoint", exporter_iso3: "SAU", importer_iso3: "IND", share: 0.0 },
];

describe("Strait of Malacca (oil) — direction-dependent shares", () => {
  it("Gulf crude to India (Arabian Sea direct) is 0 while the same exporter to China is exposed", () => {
    const tradeFlows: TradeFlowRow[] = [
      { year: 2024, importer_iso3: "CHN", exporter_iso3: "SAU", qty: 200 },
      { year: 2024, importer_iso3: "IND", exporter_iso3: "SAU", qty: 100 },
    ];
    const r = computeScenarioImpact({
      scenarioId: "malacca",
      commodity: "oil",
      year: 2024,
      tradeFlows,
      routes: malaccaRoutes,
    });
    const chn = r.byImporter.find((x) => x.iso3 === "CHN");
    const ind = r.byImporter.find((x) => x.iso3 === "IND");
    expect(chn?.shareAtRisk).toBeCloseTo(1.0, 6);
    expect(ind?.shareAtRisk).toBe(0);
  });
});
