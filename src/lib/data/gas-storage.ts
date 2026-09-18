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
