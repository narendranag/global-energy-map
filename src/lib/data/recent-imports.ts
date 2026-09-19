import type { Commodity } from "@/lib/scenarios/types";
import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";

/**
 * Each country's crude or LNG imports over its own latest 12 reported months,
 * from UN Comtrade's monthly, importer-declared series — beside the same
 * country's BACI total for BACI's latest year.
 *
 * Per-country windows, not one shared window: reporters file months apart
 * (Korea, France and Singapore stop at Dec 2025 while most run to May 2026),
 * and a shared window would show a lagging reporter as a collapse in imports.
 * The tooltip names each country's window instead.
 *
 * The two numbers are different measurements and are never merged: BACI
 * reconciles both sides of every flow, annually; this is one side, monthly,
 * as reported. Some of the world's largest importers — China, Taiwan — do not
 * report monthly to Comtrade at all, and show as no data.
 *
 * Comtrade publishes no zero rows, so a month with no reported import of the
 * selected commodity looks the same as a month the country never filed at
 * all. A month counts as *reported* if the country filed either HS code that
 * month (crude 2709 or LNG 271111) — filing one proves it was live, even if
 * the other took no cargo. Sporadic LNG importers that file crude every month
 * (USA, COL, KAZ, DNK) would otherwise show 11 of 12 months and be drawn as
 * incomplete.
 */

export const RECENT_IMPORTS_WINDOW = 12;

/** A country whose Comtrade total differs from BACI's by more than this factor is flagged. */
export const BACI_DIVERGENCE = 2;

const HS: Record<Commodity, string> = { oil: "2709", gas: "271111" };

export interface RecentImport {
  /** Million tonnes over the window. */
  readonly mt: number;
  /** First and last month of the window, "YYYY-MM". */
  readonly from: string;
  readonly through: string;
  /**
   * Months in the window the country filed *anything* to Comtrade — crude
   * (HS 2709) or LNG (HS 271111), whichever code, not just the one selected
   * (≤ 12). Comtrade publishes no zero rows, so a reporter that took no
   * cargo of the selected commodity in a month is indistinguishable from a
   * non-reporter *unless* it filed the other code that month; filing either
   * proves the reporter was live that month. `isComplete` is judged on this.
   */
  readonly monthsReported: number;
  /** Months in the window with a reported import of the *selected* commodity (≤ monthsReported). */
  readonly monthsWithImports: number;
  /** BACI imports in `baciYear`, million tonnes; null if BACI has none. */
  readonly baciMt: number | null;
}

export interface RecentImportsData {
  readonly commodity: Commodity;
  readonly byIso3: ReadonlyMap<string, RecentImport>;
  readonly baciYear: number;
  /** Largest complete (12 of 12 months) total — the ramp's upper anchor. */
  readonly max: number;
}

export function isComplete(r: RecentImport): boolean {
  return r.monthsReported >= RECENT_IMPORTS_WINDOW;
}

/** True when a complete total is more than BACI_DIVERGENCE× off BACI's. */
export function divergesFromBaci(r: RecentImport): boolean {
  if (!isComplete(r) || r.baciMt === null || r.baciMt <= 0 || r.mt <= 0) return false;
  const ratio = r.mt / r.baciMt;
  return ratio > BACI_DIVERGENCE || ratio < 1 / BACI_DIVERGENCE;
}

interface ComtradeRow {
  readonly month: string; // "YYYY-MM-DD"
  readonly importer_iso3: string;
  readonly hs_code: string;
  readonly qty: number | null; // kg
}

interface BaciRow {
  readonly year: number;
  readonly importer_iso3: string;
  readonly hs_code: string;
  readonly qty: number | null; // tonnes
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthLabel = (idx: number) =>
  `${Math.floor(idx / 12).toString()}-${String((idx % 12) + 1).padStart(2, "0")}`;

export function toRecentImports(
  commodity: Commodity,
  comtrade: readonly ComtradeRow[],
  baci: readonly BaciRow[],
): RecentImportsData {
  const hs = HS[commodity];
  const reportCodes: readonly string[] = Object.values(HS);

  // importer → month index → kg, selected commodity only.
  const monthly = new Map<string, Map<number, number>>();
  for (const r of comtrade) {
    if (r.hs_code !== hs || r.qty === null || !(r.qty > 0)) continue;
    let byMonth = monthly.get(r.importer_iso3);
    if (!byMonth) monthly.set(r.importer_iso3, (byMonth = new Map<number, number>()));
    const m = monthIndex(r.month);
    byMonth.set(m, (byMonth.get(m) ?? 0) + r.qty);
  }

  // importer → set of month indices the country filed *either* HS code.
  // A row for the other code proves the reporter was live that month, even
  // when it took no cargo of the selected commodity (Comtrade has no zero
  // rows, so absence alone can't distinguish "reported nothing" from
  // "did not report").
  const reported = new Map<string, Set<number>>();
  for (const r of comtrade) {
    if (!reportCodes.includes(r.hs_code) || r.qty === null) continue;
    let months = reported.get(r.importer_iso3);
    if (!months) reported.set(r.importer_iso3, (months = new Set<number>()));
    months.add(monthIndex(r.month));
  }

  let baciYear = 0;
  for (const r of baci) if (r.hs_code === hs && r.year > baciYear) baciYear = r.year;
  const baciT = new Map<string, number>();
  for (const r of baci) {
    if (r.hs_code !== hs || r.year !== baciYear || r.qty === null) continue;
    baciT.set(r.importer_iso3, (baciT.get(r.importer_iso3) ?? 0) + r.qty);
  }

  const byIso3 = new Map<string, RecentImport>();
  let max = 0;
  for (const [iso3, byMonth] of monthly) {
    const reportedMonths = reported.get(iso3);
    // The window is anchored on the reporter's own last *reported* month
    // across both codes, not the last month it happened to import the
    // selected commodity: a sporadic importer's last cargo can predate its
    // last filing, and anchoring on cargo alone would shift the window
    // earlier than the data actually reaches and under-count filings that
    // had no cargo of this commodity.
    const last =
      reportedMonths && reportedMonths.size > 0 ? Math.max(...reportedMonths) : Math.max(...byMonth.keys());
    const first = last - RECENT_IMPORTS_WINDOW + 1;
    let kg = 0;
    let monthsWithImports = 0;
    let monthsReported = 0;
    for (let m = first; m <= last; m++) {
      const v = byMonth.get(m);
      if (v !== undefined) {
        kg += v;
        monthsWithImports += 1;
      }
      if (reportedMonths?.has(m)) monthsReported += 1;
    }
    const t = baciT.get(iso3);
    const rec: RecentImport = {
      mt: kg / 1e9,
      from: monthLabel(first),
      through: monthLabel(last),
      monthsReported,
      monthsWithImports,
      baciMt: t === undefined ? null : t / 1e6,
    };
    byIso3.set(iso3, rec);
    if (isComplete(rec) && rec.mt > max) max = rec.mt;
  }
  return { commodity, byIso3, baciYear, max };
}

export const loadRecentImports = cachedLoader(async (commodity: Commodity): Promise<RecentImportsData> => {
  const [comtrade, baci] = await Promise.all([
    readParquet<ComtradeRow>("/data/comtrade_monthly.parquet", ["month", "importer_iso3", "hs_code", "qty"]),
    readParquet<BaciRow>("/data/trade_flow.parquet", ["year", "importer_iso3", "hs_code", "qty"]),
  ]);
  return toRecentImports(commodity, comtrade, baci);
});
