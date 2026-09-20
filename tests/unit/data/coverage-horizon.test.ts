import { describe, expect, it } from "vitest";
import type { Catalog } from "@/lib/data-catalog/types";
import { coverageHorizon } from "@/lib/data/vintage";

const entry = (
  id: string,
  label: string,
  coverage: { from: string; through: string; grain: "year" | "month" | "day" }[],
): Catalog["entries"][number] =>
  ({
    id,
    label,
    path: `/data/${id}.parquet`,
    format: "parquet",
    source_name: "Src",
    source_url: "https://example.org",
    license: "CC BY 4.0",
    as_of: "2026-09-17",
    coverage,
    runtime: true,
  }) as unknown as Catalog["entries"][number];

const catalog = (entries: Catalog["entries"][number][]): Catalog =>
  ({ version: 7, generated: "2026-09-20", entries }) as unknown as Catalog;

describe("coverageHorizon", () => {
  it("reports the timeline bounds it is given", () => {
    const h = coverageHorizon(catalog([entry("baci", "Trade", [{ from: "1995", through: "2024", grain: "year" }])]), 1990, 2024);
    expect(h.timeline).toEqual({ from: 1990, through: 2024 });
  });

  it("lists sources whose data runs past the timeline, newest first", () => {
    const h = coverageHorizon(
      catalog([
        entry("baci", "Trade", [{ from: "1995", through: "2024", grain: "year" }]),
        entry("gie", "EU gas storage", [{ from: "2020-01-01", through: "2026-09-17", grain: "day" }]),
        entry("comtrade", "Monthly imports", [{ from: "2025-01", through: "2026-05", grain: "month" }]),
        entry("steo", "Shale production", [{ from: "2009", through: "2025", grain: "year" }]),
      ]),
      1990,
      2024,
    );
    expect(h.beyond.map((b) => b.label)).toEqual(["EU gas storage", "Monthly imports", "Shale production"]);
    // "Sept", not "Sep": that is what Node's en-GB gives, and this reuses the
    // same formatPeriod the layer panel and tooltips already display.
    expect(h.beyond[0]?.through).toBe("17 Sept 2026");
    expect(h.beyond[1]?.through).toBe("May 2026");
    expect(h.beyond[2]?.through).toBe("2025");
  });

  it("excludes anything ending inside the timeline", () => {
    const h = coverageHorizon(
      catalog([
        entry("baci", "Trade", [{ from: "1995", through: "2024", grain: "year" }]),
        entry("ei", "Reserves", [{ from: "1990", through: "2020", grain: "year" }]),
      ]),
      1990,
      2024,
    );
    expect(h.beyond).toEqual([]);
  });

  // A file can feed several layers with different spans; the newest wins, and
  // one source must not appear twice in a four-line intro card.
  it("collapses an entry's several spans to its newest", () => {
    const h = coverageHorizon(
      catalog([
        entry("ei", "Country-year series", [
          { from: "1990", through: "2020", grain: "year" },
          { from: "1990", through: "2025", grain: "year" },
        ]),
      ]),
      1990,
      2024,
    );
    expect(h.beyond).toHaveLength(1);
    expect(h.beyond[0]?.through).toBe("2025");
  });

  it("ignores build-time-only entries", () => {
    const e = entry("x", "Build only", [{ from: "2020", through: "2026", grain: "year" }]);
    const h = coverageHorizon(catalog([{ ...e, runtime: false }]), 1990, 2024);
    expect(h.beyond).toEqual([]);
  });

  it("drops a trailing release parenthetical from the label", () => {
    const h = coverageHorizon(
      catalog([entry("steo", "US shale-region production, annual (EIA STEO history)", [
        { from: "2009", through: "2025", grain: "year" },
      ])]),
      1990,
      2024,
    );
    expect(h.beyond[0]?.label).toBe("US shale-region production, annual");
  });

  it("keeps a parenthetical that is not at the end", () => {
    const h = coverageHorizon(
      catalog([entry("x", "Imports (as reported) by month", [
        { from: "2025-01", through: "2026-05", grain: "month" },
      ])]),
      1990,
      2024,
    );
    expect(h.beyond[0]?.label).toBe("Imports (as reported) by month");
  });

  it("is empty when nothing exceeds the timeline", () => {
    expect(coverageHorizon(catalog([]), 1990, 2024).beyond).toEqual([]);
  });
});
