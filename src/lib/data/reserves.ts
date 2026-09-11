import type { Commodity } from "@/lib/scenarios/types";
import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";

export interface ReservesData {
  readonly commodity: Commodity;
  /** Year the values are from (<= RESERVES_LATEST_YEAR). */
  readonly dataYear: number;
  readonly values: ReadonlyMap<string, number>;
  /** Largest value in this (commodity, year) — the ramp's upper anchor. */
  readonly max: number;
}

export const RESERVES_METRIC: Record<Commodity, string> = {
  oil: "proved_reserves_oil_bbn_bbl",
  gas: "proved_reserves_gas_tcm",
};

/** Build the lookup the choropleth reads; non-finite values are dropped. */
export function toReservesData(
  commodity: Commodity,
  dataYear: number,
  rows: readonly { iso3: string; value: number | null }[],
): ReservesData {
  const values = new Map<string, number>();
  let max = 0;
  for (const r of rows) {
    if (r.value === null || !Number.isFinite(r.value)) continue;
    values.set(r.iso3, r.value);
    if (r.value > max) max = r.value;
  }
  return { commodity, dataYear, values, max };
}

interface SeriesRow {
  readonly iso3: string;
  readonly year: number;
  readonly metric: string;
  readonly value: number | null;
}

export const loadReserves = cachedLoader(
  async (commodity: Commodity, dataYear: number): Promise<ReservesData> => {
    const rows = await readParquet<SeriesRow>("/data/country_year_series.parquet", [
      "iso3",
      "year",
      "metric",
      "value",
    ]);
    const metric = RESERVES_METRIC[commodity];
    return toReservesData(
      commodity,
      dataYear,
      rows.filter((r) => r.metric === metric && r.year === dataYear),
    );
  },
);
