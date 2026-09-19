import { describe, expect, it } from "vitest";
import { exportGate } from "@/lib/query/export-gate";
import { referencesFromSerializedSql } from "@/lib/query/references";
import { queryTables } from "@/lib/query/tables";
import fixtures from "./fixtures/serialized-sql.json";

const TABLES = queryTables();
const NAMES = TABLES.map((t) => t.name);
const { trees } = fixtures as unknown as { trees: Record<string, unknown> };

/** The gate as the console applies it: DuckDB's parse tree → allowed or not. */
function gate(fixture: string) {
  return exportGate(referencesFromSerializedSql(trees[fixture], NAMES), TABLES);
}

describe("export is allowed only when every table read is downloadable", () => {
  it("allows a query over an openly licensed table", () => {
    const g = gate("simple"); // trade_flow — BACI, Etalab Open Licence 2.0
    expect(g.allowed).toBe(true);
    expect(g.tables.map((t) => t.name)).toEqual(["trade_flow"]);
  });

  it("allows a query that reads nothing licensed", () => {
    expect(gate("constant_only").allowed).toBe(true);
  });

  it("refuses a join that pulls in a view-only table, and names it", () => {
    // assets.parquet holds ODbL OpenStreetMap rows; country_year_series is EI.
    const g = gate("join");
    expect(g.allowed).toBe(false);
    if (g.allowed) return;
    expect(g.blocking.map((t) => t.name).sort()).toEqual(["assets", "country_year_series"]);
    expect(g.reason).toMatch(/view-only/);
    // The catalogue's own reason travels with the refusal.
    expect(g.reason.length).toBeGreaterThan(40);
  });

  it("refuses a view-only file read through read_parquet() directly", () => {
    const g = gate("read_parquet_view_only"); // /data/gie_daily.parquet — GIE
    expect(g.allowed).toBe(false);
    if (!g.allowed) expect(g.blocking.map((t) => t.name)).toEqual(["gie_daily"]);
  });

  it("counts a downloadable file read through read_parquet() as that table", () => {
    // /data/assets.parquet is view-only even when named as a file, not a view.
    const g = gate("read_parquet_direct");
    expect(g.allowed).toBe(false);
    if (!g.allowed) expect(g.blocking.map((t) => t.name)).toEqual(["assets"]);
  });

  it("refuses when the walker could not prove what the query reads", () => {
    for (const f of ["read_csv", "read_parquet_list_arg", "two_statements", "syntax_error"]) {
      expect(gate(f).allowed, f).toBe(false);
    }
  });

  it("refuses a name the catalogue does not know", () => {
    const g = exportGate({ tables: ["made_up"], files: [], unresolved: [] }, TABLES);
    expect(g.allowed).toBe(false);
    if (!g.allowed) expect(g.reason).toMatch(/made_up/);
  });

  it("refuses a file path the catalogue does not know", () => {
    const g = exportGate({ tables: [], files: ["/etc/passwd"], unresolved: [] }, TABLES);
    expect(g.allowed).toBe(false);
    if (!g.allowed) expect(g.reason).toMatch(/passwd/);
  });
});
