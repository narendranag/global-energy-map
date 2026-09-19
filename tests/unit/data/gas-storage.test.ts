import { describe, expect, it } from "vitest";
import { MAX_STALE_DAYS, toGasStorageByCountry } from "@/lib/data/gas-storage";

const pct = (iso3: string, gas_day: string, value: number) => ({
  iso3,
  gas_day,
  metric: "gas_storage_full_pct",
  value,
});
const twh = (iso3: string, gas_day: string, value: number) => ({
  iso3,
  gas_day,
  metric: "gas_in_storage_twh",
  value,
});

describe("toGasStorageByCountry", () => {
  it("pairs each country's own latest day's percent and TWh readings", () => {
    const rows = [twh("ITA", "2026-09-17", 173.14), pct("ITA", "2026-09-17", 85.11)];
    const out = toGasStorageByCountry(rows);
    expect(out.get("ITA")).toEqual({ gasDay: "2026-09-17", twh: 173.14, pctFull: 85.11 });
  });

  it("drops a country whose latest day is more than 30 days behind the file's global latest day", () => {
    // GBR's real-world case: its feed stopped in 2020 while everyone else reaches the present.
    const rows = [
      twh("GBR", "2020-12-30", 10),
      pct("GBR", "2020-12-30", 50),
      twh("ITA", "2026-09-17", 173.14),
      pct("ITA", "2026-09-17", 85.11),
    ];
    const out = toGasStorageByCountry(rows);
    expect(out.has("GBR")).toBe(false);
    expect(out.has("ITA")).toBe(true);
  });

  it("keeps a country within the recency floor even if a few days behind the global max", () => {
    const rows = [
      twh("BEL", "2026-09-10", 4.5),
      pct("BEL", "2026-09-10", 59),
      twh("ITA", "2026-09-17", 173.14),
      pct("ITA", "2026-09-17", 85.11),
    ];
    const out = toGasStorageByCountry(rows);
    expect(out.has("BEL")).toBe(true);
    expect(out.get("BEL")?.gasDay).toBe("2026-09-10");
  });

  it("drops a country exactly at the floor boundary plus one day", () => {
    const globalDay = "2026-09-17";
    const staleDay = "2026-08-17"; // 31 days before global day
    expect(MAX_STALE_DAYS).toBe(30);
    const rows = [
      twh("POL", staleDay, 20),
      pct("POL", staleDay, 70),
      twh("ITA", globalDay, 173.14),
      pct("ITA", globalDay, 85.11),
    ];
    const out = toGasStorageByCountry(rows);
    expect(out.has("POL")).toBe(false);
  });

  it("ignores non-finite/null values and rows for the other metric", () => {
    const rows = [
      twh("ITA", "2026-09-17", 173.14),
      pct("ITA", "2026-09-17", 85.11),
      { iso3: "ITA", gas_day: "2026-09-16", metric: "gas_in_storage_twh", value: null },
      { iso3: "ITA", gas_day: "2026-09-15", metric: "unrelated_metric", value: 999 },
    ];
    const out = toGasStorageByCountry(rows);
    expect(out.get("ITA")?.gasDay).toBe("2026-09-17");
  });
});
