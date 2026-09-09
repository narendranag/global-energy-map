import { describe, it, expect } from "vitest";
import { computeLngImportImpactsFromVoyages } from "@/lib/scenarios/lng-t3";
import { computeScenarioImpact } from "@/lib/scenarios/engine";
import type { DisruptionRouteRow, LngImportRow, LngVoyageRow, TradeFlowRow } from "@/lib/scenarios/types";

const T_A: LngImportRow = { asset_id: "T_A", name: "T_A", country_iso3: "JPN", capacity: 5 };
const T_B: LngImportRow = { asset_id: "T_B", name: "T_B", country_iso3: "JPN", capacity: 10 };
const T_C: LngImportRow = { asset_id: "T_C", name: "T_C", country_iso3: "KOR", capacity: 8 };
const GATE: LngImportRow = {
  asset_id: "gate-nl",
  name: "Gate (Rotterdam)",
  country_iso3: "NLD",
  capacity: 12,
};

function v(
  to_terminal: string,
  to_iso3: string,
  from_iso3: string,
  amount_cbm: number,
  overrides: Partial<LngVoyageRow> = {},
): LngVoyageRow {
  return {
    start_date: "2023-06-15",
    end_date: "2023-06-20",
    imo: 1,
    voyage_type: "export",
    from_terminal: "X",
    to_terminal,
    from_country_iso3: from_iso3,
    to_country_iso3: to_iso3,
    amount_cbm,
    confidence_score: 4,
    ...overrides,
  };
}

// flowsByImporter carries BACI country totals in tonnes — the absolute
// quantities voyages redistribute across terminals, never override.
function flows(entries: Record<string, { iso3: string; qty: number }[]>) {
  return new Map(Object.entries(entries));
}

describe("computeLngImportImpactsFromVoyages", () => {
  it("conserves BACI country tonnes across covered terminals (Σ Q_C·s_T == Q_C)", () => {
    // JPN's BACI total is 900 t. Voyages give T_A 100 cbm, T_B 200 cbm
    // (1:2 split) — terminal quantities must sum back to 900, not to the
    // raw voyage cbm.
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A, T_B],
      voyages: [v("T_A", "JPN", "QAT", 100), v("T_B", "JPN", "QAT", 200)],
      flowsByImporter: flows({ JPN: [{ iso3: "QAT", qty: 900 }] }),
      lookupShare: (exp) => (exp === "QAT" ? 1.0 : 0),
    });

    const a = out.find((x) => x.asset_id === "T_A");
    const b = out.find((x) => x.asset_id === "T_B");
    if (!a || !b) throw new Error("missing terminal");
    expect(a.atRiskQty + b.atRiskQty).toBeCloseTo(900, 6);
    expect(a.atRiskQty).toBeCloseTo(300, 6); // 1/3 of 900
    expect(b.atRiskQty).toBeCloseTo(600, 6); // 2/3 of 900
    expect(a.coverage).toBe("measured");
    expect(a.dataSource).toBe("lng-t3");
  });

  it("derives the exporter mix from voyages, not from BACI's exporter breakdown", () => {
    // BACI says JPN's 900 t all comes from QAT (single BACI row), but the
    // voyages reaching T_A are 50/50 QAT/USA — topSources must reflect the
    // voyage mix, not BACI's.
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [v("T_A", "JPN", "QAT", 100), v("T_A", "JPN", "USA", 100)],
      flowsByImporter: flows({ JPN: [{ iso3: "QAT", qty: 900 }] }),
      lookupShare: () => 0,
    });
    const a = out[0];
    if (!a) throw new Error("missing terminal");
    expect(a.topSources.map((s) => s.iso3).sort()).toEqual(["QAT", "USA"]);
    const qat = a.topSources.find((s) => s.iso3 === "QAT");
    const usa = a.topSources.find((s) => s.iso3 === "USA");
    if (!qat || !usa) throw new Error("missing source");
    expect(qat.qty).toBeCloseTo(450, 6);
    expect(usa.qty).toBeCloseTo(450, 6);
  });

  it("marks an uncovered terminal in an otherwise-covered country as coverage 'none' with zero quantities", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A, T_B],
      voyages: [v("T_A", "JPN", "QAT", 100)],
      flowsByImporter: flows({ JPN: [{ iso3: "QAT", qty: 900 }] }),
      lookupShare: () => 1.0,
    });
    const b = out.find((x) => x.asset_id === "T_B");
    if (!b) throw new Error("missing terminal");
    expect(b.coverage).toBe("none");
    expect(b.dataSource).toBe("lng-t3");
    expect(b.atRiskQty).toBe(0);
    expect(b.shareAtRisk).toBe(0);
    expect(b.topSources).toEqual([]);
  });

  it("falls back to the capacity-weighted BACI path for a country with no voyages", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_C],
      voyages: [v("T_A", "JPN", "QAT", 100)], // no voyages to KOR
      flowsByImporter: flows({ KOR: [{ iso3: "QAT", qty: 60 }, { iso3: "USA", qty: 40 }] }),
      lookupShare: (exp) => (exp === "QAT" ? 1.0 : 0),
    });
    const c = out.find((x) => x.asset_id === "T_C");
    if (!c) throw new Error("missing terminal");
    expect(c.dataSource).toBe("baci");
    expect(c.coverage).toBe("capacity-proxy");
    expect(c.atRiskQty).toBeCloseTo(60, 6); // sole terminal, gets all of KOR's total
  });

  it("drops ballast (return) voyages and voyages below minConfidence", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        v("T_A", "JPN", "QAT", 999, { voyage_type: "return" }),
        v("T_A", "JPN", "USA", 999, { confidence_score: 1 }),
      ],
      flowsByImporter: flows({ JPN: [{ iso3: "QAT", qty: 100 }] }),
      lookupShare: () => 1.0,
    });
    const a = out[0];
    if (!a) throw new Error("missing terminal");
    // Only the single qualifying QAT voyage counts, so it's 100% of the mix.
    expect(a.topSources).toHaveLength(1);
    expect(a.topSources[0]?.iso3).toBe("QAT");
    expect(a.atRiskQty).toBeCloseTo(100, 6);
  });

  it("matches terminal names containing punctuation exactly", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [GATE],
      voyages: [v("Gate (Rotterdam)", "NLD", "QAT", 100)],
      flowsByImporter: flows({ NLD: [{ iso3: "QAT", qty: 500 }] }),
      lookupShare: () => 1.0,
    });
    const gate = out.find((x) => x.asset_id === "gate-nl");
    if (!gate) throw new Error("missing terminal");
    expect(gate.coverage).toBe("measured");
    expect(gate.atRiskQty).toBeCloseTo(500, 6);
  });

  it("computes shareAtRisk from the exporter mix (not a quantity ratio) when Q_C = 0", () => {
    // No BACI rows for JPN at all, but voyages still exist for T_A.
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [v("T_A", "JPN", "QAT", 100), v("T_A", "JPN", "USA", 100)],
      flowsByImporter: flows({}),
      lookupShare: (exp) => (exp === "QAT" ? 1.0 : 0),
    });
    const a = out[0];
    if (!a) throw new Error("missing terminal");
    expect(a.atRiskQty).toBe(0); // Q_C = 0 → all attributed quantities are 0
    expect(a.shareAtRisk).toBeCloseTo(0.5, 6); // 50% of the mix is QAT (100% at risk)
    expect(a.coverage).toBe("measured");
  });
});

describe("computeScenarioImpact — pre-2020 years stay on the BACI path even with voyages supplied", () => {
  const routes: DisruptionRouteRow[] = [
    { disruption_id: "hormuz", kind: "chokepoint", exporter_iso3: "QAT", importer_iso3: null, share: 1.0 },
  ];
  const tradeFlows: TradeFlowRow[] = [
    { year: 2019, importer_iso3: "JPN", exporter_iso3: "QAT", qty: 900 },
  ];

  it("ignores lngVoyages for year=2019 and uses capacity-weighted BACI attribution", () => {
    const result = computeScenarioImpact({
      scenarioId: "hormuz",
      commodity: "gas",
      year: 2019,
      tradeFlows,
      routes,
      lngImports: [T_A, T_B],
      lngVoyages: [v("T_A", "JPN", "QAT", 100), v("T_B", "JPN", "QAT", 200)],
    });
    const a = result.byLngImport.find((x) => x.asset_id === "T_A");
    if (!a) throw new Error("missing terminal");
    expect(a.dataSource).toBe("baci");
    expect(a.coverage).toBe("capacity-proxy");
    // Capacity-weighted (5 vs 10 → 1/3 vs 2/3), same ratio as the voyage
    // split here, but derived from capacity, not from voyage cbm.
    expect(a.atRiskQty).toBeCloseTo(300, 6);
  });
});
