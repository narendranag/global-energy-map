import { describe, expect, it } from "vitest";
import {
  FOCUS_MIN_SHARE,
  aggregateTradeFlows,
  exporterShare,
  focusPairs,
  importerShare,
  positionPairs,
  topPairs,
  tradeFlowsInRange,
} from "@/lib/data/trade-flows";

const row = (
  year: number,
  hs: string,
  exporter: string,
  importer: string,
  qty: number | null,
) => ({ year, hs_code: hs, exporter_iso3: exporter, importer_iso3: importer, qty });

describe("aggregateTradeFlows", () => {
  it("sums a pair's rows, filters by year + commodity, and drops null/non-positive qty", () => {
    const rows = [
      row(2024, "2709", "SAU", "CHN", 1_000),
      row(2024, "2709", "SAU", "CHN", 500), // same pair, same year: summed
      row(2024, "2709", "RUS", "IND", 2_000),
      row(2023, "2709", "SAU", "CHN", 9_999), // wrong year
      row(2024, "271111", "QAT", "JPN", 9_999), // wrong commodity
      row(2024, "2709", "IRQ", "USA", null), // null qty
      row(2024, "2709", "NGA", "ESP", 0), // non-positive
    ];
    const d = aggregateTradeFlows(rows, 2024, "oil");
    expect(d.pairs).toEqual([
      { exporter_iso3: "RUS", importer_iso3: "IND", qty: 2_000 },
      { exporter_iso3: "SAU", importer_iso3: "CHN", qty: 1_500 },
    ]);
    expect(d.totalQty).toBe(3_500);
    expect(d.maxQty).toBe(2_000);
    expect(d.exporterTotals.get("SAU")).toBe(1_500);
    expect(d.importerTotals.get("CHN")).toBe(1_500);
  });

  it("sorts pairs by volume descending", () => {
    const rows = [
      row(2024, "2709", "A", "X", 10),
      row(2024, "2709", "B", "Y", 1_000),
      row(2024, "2709", "C", "Z", 100),
    ];
    const d = aggregateTradeFlows(rows, 2024, "oil");
    expect(d.pairs.map((p) => p.exporter_iso3)).toEqual(["B", "C", "A"]);
  });

  it("reads only the selected commodity's HS code", () => {
    const rows = [row(2024, "2709", "SAU", "CHN", 100), row(2024, "271111", "QAT", "JPN", 200)];
    expect(aggregateTradeFlows(rows, 2024, "oil").pairs.map((p) => p.exporter_iso3)).toEqual(["SAU"]);
    expect(aggregateTradeFlows(rows, 2024, "gas").pairs.map((p) => p.exporter_iso3)).toEqual(["QAT"]);
  });
});

describe("topPairs", () => {
  it("returns the largest n pairs and the share of world volume they carry", () => {
    const rows = [row(2024, "2709", "A", "X", 10), row(2024, "2709", "B", "Y", 70), row(2024, "2709", "C", "Z", 20)];
    const d = aggregateTradeFlows(rows, 2024, "oil");
    const { pairs, coverage } = topPairs(d, 2);
    expect(pairs.map((p) => p.exporter_iso3)).toEqual(["B", "C"]);
    expect(coverage).toBeCloseTo(0.9, 5);
  });

  it("coverage is 0 with no volume at all", () => {
    const d = aggregateTradeFlows([], 2024, "oil");
    expect(topPairs(d, 150).coverage).toBe(0);
    expect(topPairs(d, 150).pairs).toEqual([]);
  });
});

describe("focusPairs", () => {
  it("keeps every pair touching the focused country above the floor, tagging direction", () => {
    const rows = [
      row(2024, "2709", "QAT", "JPN", 1_000), // QAT export
      row(2024, "2709", "QAT", "KOR", 500), // QAT export
      row(2024, "2709", "AUS", "QAT", 1), // QAT import, tiny — below the floor of a ~1501 total
      row(2024, "2709", "SAU", "CHN", 9_999), // unrelated pair
    ];
    const d = aggregateTradeFlows(rows, 2024, "oil");
    const pairs = focusPairs(d, "QAT");
    expect(pairs.map((p) => `${p.direction}:${p.partner_iso3}:${p.qty.toString()}`)).toEqual([
      "export:JPN:1000",
      "export:KOR:500",
    ]);
  });

  it("shows all of a country's flows, not just the world top-N", () => {
    // 200 unrelated pairs, all bigger than anything JPN touches — JPN's pair
    // would not survive a top-150 cut, but focus must still show it.
    const rows: ReturnType<typeof row>[] = [];
    for (let i = 0; i < 200; i++) {
      rows.push(row(2024, "2709", `E${i.toString()}`, `I${i.toString()}`, 10_000));
    }
    rows.push(row(2024, "2709", "JPN", "SGP", 50));
    const d = aggregateTradeFlows(rows, 2024, "oil");
    expect(topPairs(d, 150).pairs.some((p) => p.exporter_iso3 === "JPN")).toBe(false);
    expect(focusPairs(d, "JPN").length).toBe(1);
  });

  it("applies the floor relative to the focused country's own total, not world volume", () => {
    const rows = [
      row(2024, "2709", "USA", "CAN", 100_000),
      row(2024, "2709", "USA", "MEX", 99), // ~0.1% of USA's total — right at the edge
    ];
    const d = aggregateTradeFlows(rows, 2024, "oil");
    const floor = 100_099 * FOCUS_MIN_SHARE;
    expect(99).toBeLessThan(floor);
    expect(focusPairs(d, "USA").map((p) => p.partner_iso3)).toEqual(["CAN"]);
  });
});

describe("importerShare / exporterShare", () => {
  it("is a pair's qty over the country's total for that side", () => {
    const rows = [row(2024, "2709", "SAU", "CHN", 300), row(2024, "2709", "RUS", "CHN", 100)];
    const d = aggregateTradeFlows(rows, 2024, "oil");
    const pair = d.pairs.find((p) => p.exporter_iso3 === "SAU");
    expect(pair).toBeDefined();
    if (!pair) throw new Error("expected pair");
    expect(importerShare(d, pair)).toBeCloseTo(0.75, 5);
    expect(exporterShare(d, pair)).toBe(1);
  });

  it("is 0 when the country has no recorded total", () => {
    const d = aggregateTradeFlows([], 2024, "oil");
    expect(importerShare(d, { exporter_iso3: "A", importer_iso3: "B", qty: 10 })).toBe(0);
  });
});

describe("positionPairs", () => {
  it("attaches exporter/importer anchor coordinates and drops pairs with no known anchor", () => {
    const pairs = [
      { exporter_iso3: "SAU", importer_iso3: "CHN", qty: 100 },
      { exporter_iso3: "ZZZ", importer_iso3: "CHN", qty: 100 }, // not a real code
    ];
    const positioned = positionPairs(pairs);
    expect(positioned).toHaveLength(1);
    expect(positioned[0]?.exporter_iso3).toBe("SAU");
    expect(typeof positioned[0]?.from_lon).toBe("number");
    expect(typeof positioned[0]?.to_lat).toBe("number");
  });
});

describe("tradeFlowsInRange", () => {
  it("is true only within BACI's 1995–2024 coverage", () => {
    expect(tradeFlowsInRange(1994)).toBe(false);
    expect(tradeFlowsInRange(1995)).toBe(true);
    expect(tradeFlowsInRange(2024)).toBe(true);
    expect(tradeFlowsInRange(2025)).toBe(false);
  });
});
