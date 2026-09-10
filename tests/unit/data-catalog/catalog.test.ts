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

describe("data-catalog: shipped public/data/catalog.json", () => {
  it("parses the real generated catalog", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const raw: unknown = JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", "catalog.json"), "utf8"),
    );
    const catalog = parseCatalog(raw);
    expect(catalog.version).toBeGreaterThanOrEqual(6);
    expect(catalog.entries.length).toBeGreaterThan(0);
    const ids = catalog.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of catalog.entries) {
      expect(e.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof e.bytes).toBe("number");
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // The runtime geometry sidecars are catalogued; dead files are not.
    const paths = new Set(catalog.entries.map((e) => e.path));
    expect(paths.has("/data/pipelines.geojson")).toBe(true);
    expect(paths.has("/data/basins.geojson")).toBe(true);
    expect(paths.has("/data/chokepoint_route.parquet")).toBe(false);
    expect(paths.has("/data/pipelines.parquet")).toBe(false);
  });

  it("accepts any positive integer version and rejects nonsense", () => {
    const base = { generated_at: "2026-01-01T00:00:00Z", entries: [] };
    expect(parseCatalog({ ...base, version: 42 }).version).toBe(42);
    expect(() => parseCatalog({ ...base, version: "6" })).toThrow();
    expect(() => parseCatalog({ ...base, version: 0 })).toThrow();
  });
});
