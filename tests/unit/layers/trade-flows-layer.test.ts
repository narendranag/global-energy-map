import { describe, expect, it } from "vitest";
import { buildTradeFlowsLayer, formatTradeFlowTooltip, TRADE_FLOWS_LAYER_ID } from "@/components/layers/TradeFlowsLayer";
import { aggregateTradeFlows, TOP_N_PAIRS } from "@/lib/data/trade-flows";
import { NATURAL_EARTH_ISO3 } from "@/lib/geo/iso3";
import type { TooltipContext } from "@/components/layers/tooltip";

function call(accessor: unknown, row: unknown): unknown {
  return (accessor as (d: unknown) => unknown)(row);
}
function dataOf(layer: { props: { data: unknown } }): readonly unknown[] {
  return layer.props.data as readonly unknown[];
}

const row = (exporter: string, importer: string, qty: number, hs = "2709", year = 2024) => ({
  year,
  hs_code: hs,
  exporter_iso3: exporter,
  importer_iso3: importer,
  qty,
});

/**
 * Real ISO3 codes only: `country-anchors.ts` does not cover made-up codes.
 * QAT and JPN are excluded from the noise pool so the focus test's own
 * QAT → JPN pair is the only one touching either country.
 */
const CODES = NATURAL_EARTH_ISO3.filter((c) => c !== "QAT" && c !== "JPN");
const realPair = (i: number) => [CODES[i % CODES.length] ?? "USA", CODES[(i + 50) % CODES.length] ?? "CHN"] as const;

describe("buildTradeFlowsLayer", () => {
  it("draws the world top-N pairs when no country is focused", () => {
    const rows = Array.from({ length: TOP_N_PAIRS + 20 }, (_, i) => {
      const [e, m] = realPair(i);
      return row(e, m, 1000 - i);
    });
    const data = aggregateTradeFlows(rows, 2024, "oil");
    const layer = buildTradeFlowsLayer(data, { commodity: "oil", focus: null });
    expect(layer.id).toBe(TRADE_FLOWS_LAYER_ID);
    expect(dataOf(layer)).toHaveLength(TOP_N_PAIRS);
  });

  it("with a country focused, draws only that country's flows, not the world top-N", () => {
    const rows = [
      ...Array.from({ length: 160 }, (_, i) => {
        const [e, m] = realPair(i);
        return row(e, m, 100_000 - i);
      }),
      row("QAT", "JPN", 500),
    ];
    const data = aggregateTradeFlows(rows, 2024, "oil");
    const layer = buildTradeFlowsLayer(data, { commodity: "oil", focus: "QAT" });
    const rowsOut = dataOf(layer) as { exporter_iso3: string; importer_iso3: string }[];
    expect(rowsOut).toHaveLength(1);
    expect(rowsOut[0]).toMatchObject({ exporter_iso3: "QAT", importer_iso3: "JPN" });
  });

  it("positions arcs at the exporter/importer anchors and scales width by volume", () => {
    const data = aggregateTradeFlows([row("SAU", "CHN", 1000), row("RUS", "IND", 100)], 2024, "oil");
    const layer = buildTradeFlowsLayer(data, { commodity: "oil", focus: null });
    const rows = dataOf(layer);
    const big = rows.find((r) => (r as { exporter_iso3: string }).exporter_iso3 === "SAU");
    const small = rows.find((r) => (r as { exporter_iso3: string }).exporter_iso3 === "RUS");
    expect(big).toBeDefined();
    expect(small).toBeDefined();
    const bigW = call(layer.props.getWidth, big) as number;
    const smallW = call(layer.props.getWidth, small) as number;
    expect(bigW).toBeGreaterThan(smallW);
    const src = call(layer.props.getSourcePosition, big) as number[];
    expect(src).toHaveLength(2);
    expect(Number.isFinite(src[0])).toBe(true);
  });
});

describe("formatTradeFlowTooltip", () => {
  const arc = {
    exporter_iso3: "SAU",
    importer_iso3: "CHN",
    qty: 5_000_000, // tonnes
    from_lon: 0,
    from_lat: 0,
    to_lon: 0,
    to_lat: 0,
    exporterSharePct: 40,
    importerSharePct: 25,
  };

  it("names exporter, importer, volume in Mt, kb/d for crude, both shares and the source", () => {
    const ctx: TooltipContext = { year: 2024, commodity: "oil", scenario: null };
    const t = formatTradeFlowTooltip(arc, ctx) ?? "";
    expect(t).toContain("SAU → CHN");
    expect(t).toContain("5.00 Mt");
    expect(t).toMatch(/kb\/d/);
    expect(t).toContain("CHN's total imports: 25.0%");
    expect(t).toContain("SAU's total exports: 40.0%");
    expect(t).toMatch(/^Source: .+\(as of \d{4}-\d{2}-\d{2}\)$/m);
  });

  it("omits kb/d for LNG (gas is not measured in barrels)", () => {
    const ctx: TooltipContext = { year: 2024, commodity: "gas", scenario: null };
    const t = formatTradeFlowTooltip(arc, ctx) ?? "";
    expect(t).not.toMatch(/kb\/d/);
    expect(t).toContain("LNG trade");
  });
});
