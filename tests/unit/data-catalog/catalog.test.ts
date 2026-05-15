import { describe, it, expect } from "vitest";
import { parseCatalog, type Catalog } from "@/lib/data-catalog";

describe("data-catalog", () => {
  it("parses a valid catalog with one entry", () => {
    const raw = {
      version: 1,
      generated_at: "2026-05-15T00:00:00Z",
      entries: [
        {
          id: "ei_reserves",
          label: "Energy Institute Statistical Review — Reserves",
          path: "/data/country_year_series.parquet",
          format: "parquet",
          source_name: "Energy Institute",
          source_url: "https://www.energyinst.org/statistical-review",
          license: "Free, see source terms",
          as_of: "2025-06-01",
          layers: ["reserves"],
        },
      ],
    };
    const catalog: Catalog = parseCatalog(raw);
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]?.id).toBe("ei_reserves");
  });

  it("throws on missing required fields", () => {
    expect(() => parseCatalog({ version: 1, entries: [{ id: "x" }] })).toThrow();
  });
});
