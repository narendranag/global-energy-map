import { describe, it, expect } from "vitest";
import { computeLngImportImpactsFromVoyages } from "@/lib/scenarios/lng-t3";
import type { LngImportRow, LngVoyageRow } from "@/lib/scenarios/types";

const T_A: LngImportRow = { asset_id: "T_A", country_iso3: "JPN", capacity: 5 };
const T_B: LngImportRow = { asset_id: "T_B", country_iso3: "JPN", capacity: 10 };
const T_C: LngImportRow = { asset_id: "T_C", country_iso3: "KOR", capacity: 8 };

function v(
  to_terminal: string,
  to_iso3: string,
  from_iso3: string,
  amount_cbm: number,
  date = "2023-06-15",
): LngVoyageRow {
  return {
    start_date: date,
    end_date: date,
    imo: 1,
    voyage_type: "export",
    from_terminal: "X",
    to_terminal,
    from_country_iso3: from_iso3,
    to_country_iso3: to_iso3,
    amount_cbm,
    confidence_score: 4,
  };
}

describe("computeLngImportImpactsFromVoyages", () => {
  it("attributes voyage qty directly to receiving terminal (no capacity proxy)", () => {
    // T_A receives 100 from QAT, T_B receives 200 from QAT. With Hormuz
    // applied at 100% share for QAT, T_A shareAtRisk=1.0, T_B shareAtRisk=1.0,
    // but absolute atRiskQty reflects voyage volumes — T_B has 2× T_A.
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A, T_B],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        v("T_B", "JPN", "QAT", 200),
      ],
      lookupShare: (exp) => (exp === "QAT" ? 1.0 : 0),
    });

    const a = out.find((x) => x.asset_id === "T_A");
    const b = out.find((x) => x.asset_id === "T_B");
    expect(a?.atRiskQty).toBe(100);
    expect(b?.atRiskQty).toBe(200);
    expect(a?.shareAtRisk).toBe(1.0);
    expect(b?.shareAtRisk).toBe(1.0);
    expect(a?.dataSource).toBe("lng-t3");
    expect(b?.dataSource).toBe("lng-t3");
  });

  it("computes per-terminal shareAtRisk over total voyages to that terminal", () => {
    // T_A: 100 from QAT (50% Hormuz) + 50 from USA (0% Hormuz)
    // expected: total 150, at-risk 50, shareAtRisk = 50/150 = 0.333...
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        v("T_A", "JPN", "USA", 50),
      ],
      lookupShare: (exp) => (exp === "QAT" ? 0.5 : 0),
    });
    const a = out[0];
    expect(a.atRiskQty).toBe(50);
    expect(a.shareAtRisk).toBeCloseTo(50 / 150);
  });

  it("returns zero impact for terminals with no voyage data", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A, T_B, T_C],
      voyages: [v("T_A", "JPN", "QAT", 100)],
      lookupShare: (exp) => (exp === "QAT" ? 1.0 : 0),
    });
    const b = out.find((x) => x.asset_id === "T_B");
    const c = out.find((x) => x.asset_id === "T_C");
    expect(b?.atRiskQty).toBe(0);
    expect(b?.shareAtRisk).toBe(0);
    expect(c?.atRiskQty).toBe(0);
    expect(c?.shareAtRisk).toBe(0);
  });

  it("topSources ranks exporters by qty descending", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        v("T_A", "JPN", "USA", 300),
        v("T_A", "JPN", "AUS", 200),
      ],
      lookupShare: () => 0,
    });
    expect(out[0].topSources.map((s) => s.iso3)).toEqual(["USA", "AUS", "QAT"]);
    expect(out[0].topSources[0].qty).toBe(300);
  });

  it("only considers export voyages (drops return ballast)", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        v("T_A", "JPN", "QAT", 100),
        { ...v("T_A", "JPN", "QAT", 999), voyage_type: "return" },
      ],
      lookupShare: () => 1.0,
    });
    expect(out[0].atRiskQty).toBe(100);
  });

  it("filters by min confidence score (default 3)", () => {
    const out = computeLngImportImpactsFromVoyages({
      lngImports: [T_A],
      voyages: [
        { ...v("T_A", "JPN", "QAT", 100), confidence_score: 4 },
        { ...v("T_A", "JPN", "QAT", 999), confidence_score: 1 },
      ],
      lookupShare: () => 1.0,
    });
    expect(out[0].atRiskQty).toBe(100);
  });
});
