import { describe, expect, it } from "vitest";
import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import { createViewSql, findTable, queryTables, tableNameForPath } from "@/lib/query/tables";

describe("catalog → console tables", () => {
  const tables = queryTables();

  it("exposes one table per shipped parquet file, named after the file", () => {
    const parquet = new Set(
      BUNDLED_CATALOG.entries.filter((e) => e.path.endsWith(".parquet")).map((e) => e.path),
    );
    expect(tables.map((t) => t.path).sort()).toEqual([...parquet].sort());
    expect(tables.map((t) => t.name)).toContain("trade_flow");
  });

  it("leaves the GeoJSON sidecars out (they are not SQL tables)", () => {
    expect(tables.some((t) => t.path.endsWith(".geojson"))).toBe(false);
  });

  it("is downloadable only when every source sharing the file is", () => {
    const assets = findTable("assets", tables);
    const open = findTable("assets_open", tables);
    // assets.parquet mixes ODbL OpenStreetMap refinery rows in (LICENSE-DATA.md).
    expect(assets?.downloadable).toBe(false);
    expect(assets?.downloadNote).toBeTruthy();
    expect(open?.downloadable).toBe(true);
    expect(findTable("trade_flow", tables)?.downloadable).toBe(true);
    // The Energy Institute reserves are shown but never redistributed.
    expect(findTable("country_year_series", tables)?.downloadable).toBe(false);
  });

  it("carries every source of a shared file, and the rows they contribute", () => {
    const assets = findTable("assets", tables);
    expect(assets?.sources.length).toBeGreaterThan(1);
    expect(assets?.rows).toBe(assets?.sources.reduce((n, s) => n + (s.rows ?? 0), 0));
  });

  it("knows each table's columns and their SQL types", () => {
    const trade = findTable("trade_flow", tables);
    expect(trade?.columns.map((c) => c.name)).toContain("importer_iso3");
    expect(trade?.columns.every((c) => c.type !== "")).toBe(true);
    for (const t of tables) expect(t.columns.length, t.name).toBeGreaterThan(0);
  });

  it("looks tables up case-insensitively, as DuckDB does", () => {
    expect(findTable("TRADE_FLOW", tables)?.name).toBe("trade_flow");
    expect(findTable("nope", tables)).toBeUndefined();
  });
});

describe("view SQL", () => {
  it("reads the hardcoded logical path, quoting both sides", () => {
    expect(
      createViewSql({
        name: "trade_flow",
        path: "/data/trade_flow.parquet",
        label: "",
        columns: [],
        rows: 0,
        sources: [],
        downloadable: true,
      }),
    ).toBe(
      `CREATE OR REPLACE VIEW "trade_flow" AS SELECT * FROM read_parquet('/data/trade_flow.parquet')`,
    );
  });

  it("escapes quotes rather than letting them close the literal", () => {
    const sql = createViewSql({
      name: 'we"ird',
      path: "/data/o'dd.parquet",
      label: "",
      columns: [],
      rows: 0,
      sources: [],
      downloadable: true,
    });
    expect(sql).toContain(`"we""ird"`);
    expect(sql).toContain(`'/data/o''dd.parquet'`);
  });

  it("names a file after its stem", () => {
    expect(tableNameForPath("/data/lng_voyage.parquet")).toBe("lng_voyage");
  });
});
