import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";

/**
 * EU gas storage fullness on the most recent gas day GIE has published.
 *
 * This layer is deliberately **independent of the year slider**. GIE publishes
 * daily and the slider is annual 1990–2024, so there is no honest mapping
 * between them; the layer always shows the latest reading and says so, rather
 * than pretending a 2015 slider position means anything here.
 */
export interface GasStorageData {
  /** ISO date of the gas day these readings are from, e.g. "2026-09-17". */
  readonly gasDay: string;
  /** iso3 → percent full. Can exceed 100 (see gasStorageRampT). */
  readonly values: ReadonlyMap<string, number>;
}

export const GAS_STORAGE_METRIC = "gas_storage_full_pct";

interface GieRow {
  readonly iso3: string;
  readonly gas_day: string;
  readonly metric: string;
  readonly value: number | null;
}

/** Latest gas day present for the metric, and every country's reading on it. */
export function toGasStorageData(rows: readonly GieRow[]): GasStorageData {
  let gasDay = "";
  for (const r of rows) {
    if (r.metric === GAS_STORAGE_METRIC && r.gas_day > gasDay) gasDay = r.gas_day;
  }
  const values = new Map<string, number>();
  if (gasDay === "") return { gasDay, values };
  for (const r of rows) {
    if (r.metric !== GAS_STORAGE_METRIC || r.gas_day !== gasDay) continue;
    if (r.value === null || !Number.isFinite(r.value)) continue;
    values.set(r.iso3, r.value);
  }
  return { gasDay, values };
}

export const loadGasStorage = cachedLoader(async (): Promise<GasStorageData> => {
  const rows = await readParquet<GieRow>("/data/gie_daily.parquet", [
    "iso3",
    "gas_day",
    "metric",
    "value",
  ]);
  return toGasStorageData(rows);
});

/** AGSI's absolute in-storage reading, TWh — see `build_gie_daily.py`. */
export const GAS_IN_STORAGE_TWH_METRIC = "gas_in_storage_twh";

/**
 * One country's most recent AGSI reading, on **that country's own** latest
 * reporting day — not a single day shared across countries. A handful of
 * countries lag the rest by a few days, so this does not anchor every
 * country on the global max day (that would silently drop a normal
 * few-day laggard). It does, however, enforce a **recency floor**: a
 * country whose own latest day is more than `MAX_STALE_DAYS` behind the
 * file's global latest day is dropped rather than shown as if it were
 * current — GBR's own feed stopped reporting `gas_in_storage_twh` on
 * 2020-12-30 while every other GIE country reaches the present day, so
 * without this floor a reading nearly six years old would print next to
 * five-year-old scenario exposure as though it were today's number (used
 * by the S6 scenario-context block, T3; see
 * `docs/superpowers/research/final-review-findings.md` finding #2).
 */
export interface CountryGasStorageReading {
  readonly gasDay: string;
  readonly twh: number;
  readonly pctFull: number;
}

export type GasStorageByCountry = ReadonlyMap<string, CountryGasStorageReading>;

/** A country's latest reading must be within this many days of the file's global latest day. */
export const MAX_STALE_DAYS = 30;

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / msPerDay;
}

/** Per-country latest (percent, TWh) pair — both metrics must land on the same day. */
export function toGasStorageByCountry(rows: readonly GieRow[]): GasStorageByCountry {
  const pctByCountryDay = new Map<string, Map<string, number>>();
  const twhByCountryDay = new Map<string, Map<string, number>>();
  const latestDay = new Map<string, string>();
  let globalLatestDay = "";
  for (const r of rows) {
    if (r.value === null || !Number.isFinite(r.value)) continue;
    if (r.metric === GAS_STORAGE_METRIC) {
      let byDay = pctByCountryDay.get(r.iso3);
      if (!byDay) pctByCountryDay.set(r.iso3, (byDay = new Map<string, number>()));
      byDay.set(r.gas_day, r.value);
    } else if (r.metric === GAS_IN_STORAGE_TWH_METRIC) {
      let byDay = twhByCountryDay.get(r.iso3);
      if (!byDay) twhByCountryDay.set(r.iso3, (byDay = new Map<string, number>()));
      byDay.set(r.gas_day, r.value);
      const cur = latestDay.get(r.iso3);
      if (cur === undefined || r.gas_day > cur) latestDay.set(r.iso3, r.gas_day);
      if (r.gas_day > globalLatestDay) globalLatestDay = r.gas_day;
    }
  }
  const out = new Map<string, CountryGasStorageReading>();
  for (const [iso3, gasDay] of latestDay) {
    if (globalLatestDay !== "" && daysBetween(gasDay, globalLatestDay) > MAX_STALE_DAYS) continue;
    const twh = twhByCountryDay.get(iso3)?.get(gasDay);
    const pctFull = pctByCountryDay.get(iso3)?.get(gasDay);
    if (twh === undefined || pctFull === undefined) continue;
    out.set(iso3, { gasDay, twh, pctFull });
  }
  return out;
}

/**
 * Reads the same file and columns as `loadGasStorage` — the parquet loader
 * caches by (url, columns), so this costs no extra fetch when both are used
 * on the same page (CLAUDE.md's one-fetch-per-file rule).
 */
export const loadGasStorageByCountry = cachedLoader(async (): Promise<GasStorageByCountry> => {
  const rows = await readParquet<GieRow>("/data/gie_daily.parquet", [
    "iso3",
    "gas_day",
    "metric",
    "value",
  ]);
  return toGasStorageByCountry(rows);
});
