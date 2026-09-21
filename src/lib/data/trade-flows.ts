import { countryAnchor } from "@/lib/geo/country-anchors";
import { dataIso3 } from "@/lib/geo/iso3";
import type { Commodity } from "@/lib/scenarios/types";
import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";
import { TRADE_FIRST_YEAR, TRADE_LAST_YEAR } from "@/lib/data-catalog/years";

/**
 * BACI (CEPII) bilateral crude (HS 2709) + LNG (HS 271111) trade, aggregated
 * into one row per (exporter, importer) pair for a year + commodity —
 * `TradeFlowsLayer.tsx`'s "Trade flows (BACI)" arcs. This is the flow BACI
 * carries every scenario share on, and until now it was never drawn.
 *
 * BACI's coverage comes from the catalog (`src/lib/data-catalog/years.ts`),
 * not from a literal written here and mirrored into two other modules;
 * outside it `loadTradeFlows` resolves to an empty pair list without reading
 * the file.
 */
export { TRADE_FIRST_YEAR, TRADE_LAST_YEAR };

export function tradeFlowsInRange(year: number): boolean {
  return year >= TRADE_FIRST_YEAR && year <= TRADE_LAST_YEAR;
}

/** HS code BACI files each commodity under (also the export CSV's `hs_code` column). */
export const HS: Record<Commodity, string> = { oil: "2709", gas: "271111" };

/**
 * At world view, only the largest pairs are drawn — otherwise every one of
 * ~1,200–1,600 crude pairs (or ~500–740 LNG pairs) a year renders as an
 * unreadable hairball. 150 pairs was chosen by looking at the cumulative
 * share of world volume the top-N pairs carry across 1995–2024 (measured
 * with DuckDB against the shipped parquet, 2026-09-19): top 150 is
 * consistently 82–87% of crude volume and 94–100% of LNG volume every year
 * (2024: crude 86.6%, LNG 96.1%). Top 100 drops that to 73–79% crude; top
 * 200 buys only another ~2–5 points at roughly double the arc count. 150
 * pairs is also comfortably inside "a few hundred arcs" (S2's performance
 * budget) even before any width/opacity culling.
 */
export const TOP_N_PAIRS = 150;

/**
 * With a country focused, every pair touching it is shown (not just the top
 * N) — that is the point of the focus view — but pairs under this share of
 * the focused country's total trade (imports + exports combined, for the
 * active year + commodity) are still dropped. Without a floor, a country
 * with 100+ partners (the US had 110 crude pairs in 2024) draws dozens of
 * arcs for flows of a few tonnes, reporting noise rather than trade. Half
 * of USA's 2024 crude pairs (57 of 110) fall under this floor.
 */
export const FOCUS_MIN_SHARE = 0.001;

interface TradeFlowFileRow {
  readonly year: number;
  readonly hs_code: string;
  readonly exporter_iso3: string;
  readonly importer_iso3: string;
  readonly qty: number | null;
}

const COLUMNS = ["year", "hs_code", "exporter_iso3", "importer_iso3", "qty"] as const;

export interface TradeFlowPair {
  readonly exporter_iso3: string;
  readonly importer_iso3: string;
  /** Tonnes, summed (BACI is already one row per pair per year in this file). */
  readonly qty: number;
}

export interface TradeFlowsData {
  readonly year: number;
  readonly commodity: Commodity;
  /** Every non-zero pair for this year + commodity, sorted by qty descending. */
  readonly pairs: readonly TradeFlowPair[];
  /** Sum of `qty` over every pair — the denominator for "share of world volume". */
  readonly totalQty: number;
  /** Largest pair's qty — the width scale's anchor. */
  readonly maxQty: number;
  readonly exporterTotals: ReadonlyMap<string, number>;
  readonly importerTotals: ReadonlyMap<string, number>;
}

/** Pure aggregation: raw BACI rows → one sorted pair list + lookups, for one year + commodity. */
export function aggregateTradeFlows(
  rows: readonly TradeFlowFileRow[],
  year: number,
  commodity: Commodity,
): TradeFlowsData {
  const hs = HS[commodity];
  const byPair = new Map<string, TradeFlowPair>();
  for (const r of rows) {
    if (r.hs_code !== hs || r.year !== year || r.qty === null || !(r.qty > 0)) continue;
    const key = `${r.exporter_iso3}\u0000${r.importer_iso3}`;
    const existing = byPair.get(key);
    if (existing) {
      byPair.set(key, { ...existing, qty: existing.qty + r.qty });
    } else {
      byPair.set(key, { exporter_iso3: r.exporter_iso3, importer_iso3: r.importer_iso3, qty: r.qty });
    }
  }
  const pairs = [...byPair.values()].sort((a, b) => b.qty - a.qty);

  let totalQty = 0;
  const exporterTotals = new Map<string, number>();
  const importerTotals = new Map<string, number>();
  for (const p of pairs) {
    totalQty += p.qty;
    exporterTotals.set(p.exporter_iso3, (exporterTotals.get(p.exporter_iso3) ?? 0) + p.qty);
    importerTotals.set(p.importer_iso3, (importerTotals.get(p.importer_iso3) ?? 0) + p.qty);
  }

  return {
    year,
    commodity,
    pairs,
    totalQty,
    maxQty: pairs[0]?.qty ?? 0,
    exporterTotals,
    importerTotals,
  };
}

/** The largest `n` pairs, and the share of `totalQty` they carry (0–1). */
export function topPairs(
  data: TradeFlowsData,
  n: number = TOP_N_PAIRS,
): { readonly pairs: readonly TradeFlowPair[]; readonly coverage: number } {
  const pairs = data.pairs.slice(0, n);
  const shown = pairs.reduce((sum, p) => sum + p.qty, 0);
  return { pairs, coverage: data.totalQty > 0 ? shown / data.totalQty : 0 };
}

/**
 * Every pair touching `focus` (as exporter or importer) above `FOCUS_MIN_SHARE`
 * of the focused country's total trade (imports + exports) that year — not
 * just the top N. `direction` on each pair says which side `focus` is on, so
 * the layer can colour imports and exports distinctly.
 */
export interface FocusPair extends TradeFlowPair {
  readonly direction: "import" | "export";
  /** `focus`'s trade partner on the other side of this pair. */
  readonly partner_iso3: string;
}

export function focusPairs(
  data: TradeFlowsData,
  focusCode: string,
  minShare: number = FOCUS_MIN_SHARE,
): readonly FocusPair[] {
  // `focus` is a polygon code; BACI spells South Sudan and Palestine
  // differently (A2). `dataIso3` is the identity for every other code.
  const focus = dataIso3(focusCode);
  const touching = data.pairs.filter((p) => p.exporter_iso3 === focus || p.importer_iso3 === focus);
  const focusTotal = touching.reduce((sum, p) => sum + p.qty, 0);
  const floor = focusTotal * minShare;
  const out: FocusPair[] = [];
  for (const p of touching) {
    if (p.qty < floor) continue;
    if (p.exporter_iso3 === focus) {
      out.push({ ...p, direction: "export", partner_iso3: p.importer_iso3 });
    } else {
      out.push({ ...p, direction: "import", partner_iso3: p.exporter_iso3 });
    }
  }
  return out.sort((a, b) => b.qty - a.qty);
}

export interface Positioned {
  readonly from_lon: number;
  readonly from_lat: number;
  readonly to_lon: number;
  readonly to_lat: number;
}

/**
 * Attach exporter/importer anchor coordinates (`country-anchors.ts`); a pair
 * whose exporter or importer has no anchor is dropped. As of 2026-09-19 every
 * code that appears in `trade_flow.parquet` has one (see
 * `tests/unit/geo/country-anchors.test.ts`), so this is a defensive filter,
 * not an expected loss.
 */
export function positionPairs<T extends TradeFlowPair>(pairs: readonly T[]): (T & Positioned)[] {
  const out: (T & Positioned)[] = [];
  for (const p of pairs) {
    const from = countryAnchor(p.exporter_iso3);
    const to = countryAnchor(p.importer_iso3);
    if (!from || !to) continue;
    out.push({ ...p, from_lon: from[0], from_lat: from[1], to_lon: to[0], to_lat: to[1] });
  }
  return out;
}

/** Share of `importerTotals`/`exporterTotals` a pair represents (0–1), for the tooltip. */
export function importerShare(data: TradeFlowsData, pair: TradeFlowPair): number {
  const total = data.importerTotals.get(pair.importer_iso3) ?? 0;
  return total > 0 ? pair.qty / total : 0;
}
export function exporterShare(data: TradeFlowsData, pair: TradeFlowPair): number {
  const total = data.exporterTotals.get(pair.exporter_iso3) ?? 0;
  return total > 0 ? pair.qty / total : 0;
}

/**
 * One read of `trade_flow.parquet` (parquet.ts caches the decoded rows by
 * column set — see `readParquet` — so every year/commodity switch after the
 * first is an in-memory filter, not a refetch), aggregated per (year,
 * commodity). Outside BACI's 1995–2024 coverage this resolves to an empty
 * data set without reading the file.
 */
export const loadTradeFlows = cachedLoader(
  async (year: number, commodity: Commodity): Promise<TradeFlowsData> => {
    if (!tradeFlowsInRange(year)) {
      return { year, commodity, pairs: [], totalQty: 0, maxQty: 0, exporterTotals: new Map(), importerTotals: new Map() };
    }
    const rows = await readParquet<TradeFlowFileRow>("/data/trade_flow.parquet", COLUMNS);
    return aggregateTradeFlows(rows, year, commodity);
  },
);
