import { describe, expect, it } from "vitest";
import { referencesFromSerializedSql } from "@/lib/query/references";
import fixtures from "./fixtures/serialized-sql.json";

/**
 * The parse trees here are DuckDB's own, recorded by
 * `scripts/dev/serialize_sql_fixtures.py` — the same serializer the WASM
 * build runs. Every case pins one decision the export gate depends on.
 */

interface Fixtures {
  readonly sql: Record<string, string>;
  readonly trees: Record<string, unknown>;
}
const { trees } = fixtures as unknown as Fixtures;

const KNOWN = ["trade_flow", "assets", "country_year_series", "gie_daily"];

const refs = (name: string) => {
  const tree = trees[name];
  expect(tree, `missing fixture: ${name}`).toBeDefined();
  return referencesFromSerializedSql(tree, KNOWN);
};

describe("tables a query reads", () => {
  it("reads a plain FROM", () => {
    expect(refs("simple")).toEqual({ tables: ["trade_flow"], files: [], unresolved: [], executable: true });
  });

  it("reads both sides of a JOIN", () => {
    expect(refs("join").tables).toEqual(["assets", "country_year_series"]);
  });

  it("reads tables inside subqueries, including a WHERE … IN", () => {
    expect(refs("subquery").tables).toEqual(["country_year_series", "trade_flow"]);
  });

  it("sees through quoted identifiers and aliases", () => {
    expect(refs("quoted_identifiers").tables).toEqual(["trade_flow"]);
  });

  it("reads both sides of a set operation", () => {
    expect(refs("set_operation").tables).toEqual(["country_year_series", "trade_flow"]);
  });

  it("counts the table a CTE reads, not the CTE's own name", () => {
    expect(refs("cte")).toEqual({ tables: ["trade_flow"], files: [], unresolved: [], executable: true });
  });

  it("does not treat a recursive CTE's self-reference as a table", () => {
    expect(refs("recursive_cte")).toEqual({ tables: [], files: [], unresolved: [], executable: true });
  });

  it("treats a VALUES list and a bare constant as reading nothing", () => {
    expect(refs("values_list")).toEqual({ tables: [], files: [], unresolved: [], executable: true });
    expect(refs("constant_only")).toEqual({ tables: [], files: [], unresolved: [], executable: true });
  });

  it("accepts the default catalog and schema spelled out", () => {
    expect(refs("qualified_memory_main").tables).toEqual(["trade_flow"]);
  });
});

describe("read_parquet() counts as reading that file", () => {
  it("records the path a literal read_parquet() call reads", () => {
    expect(refs("read_parquet_direct")).toEqual({
      tables: [],
      files: ["/data/assets.parquet"],
      unresolved: [],
      executable: true,
    });
  });

  it("records a file read from inside a scalar subquery", () => {
    expect(refs("scalar_subquery_over_file").files).toEqual(["/data/gie_daily.parquet"]);
  });
});

describe("anything it cannot prove is refused", () => {
  const refused = (name: string) => {
    const r = refs(name);
    expect(r.unresolved.length, `${name} should be refused`).toBeGreaterThan(0);
    return r.unresolved.join(" ");
  };

  it("refuses a table function other than read_parquet", () => {
    expect(refused("read_csv")).toMatch(/read_csv/);
  });

  it("refuses read_parquet given a list instead of one literal path", () => {
    expect(refused("read_parquet_list_arg")).toMatch(/single file path/);
  });

  it("refuses a CTE that shadows the name of a real table", () => {
    expect(refused("cte_shadowing_a_table")).toMatch(/trade_flow/);
  });

  it("refuses a table qualified with another catalog", () => {
    expect(refused("qualified_other_catalog")).toMatch(/other/);
  });

  it("refuses more than one statement", () => {
    expect(refused("two_statements")).toMatch(/one statement/);
  });

  it("refuses anything that is not a SELECT", () => {
    expect(refused("non_select")).toMatch(/SELECT/);
  });

  it("refuses SQL DuckDB could not parse", () => {
    expect(refused("syntax_error")).toMatch(/syntax error/);
  });

  it("refuses a parse tree of an unexpected shape", () => {
    expect(referencesFromSerializedSql(null).unresolved).toHaveLength(1);
    expect(referencesFromSerializedSql({ error: false }).unresolved).toHaveLength(1);
  });

  it("refuses a table reference kind it does not model", () => {
    const tree = {
      error: false,
      statements: [
        {
          node: {
            type: "SELECT_NODE",
            cte_map: { map: [] },
            from_table: { type: "PIVOT", alias: "", sample: null },
          },
        },
      ],
    };
    expect(referencesFromSerializedSql(tree, KNOWN).unresolved.join(" ")).toMatch(/PIVOT/);
  });
});

describe("executable: whether the engine may even run the statement", () => {
  // Anything DuckDB's own json_serialize_sql refuses to represent is not a
  // single SELECT — the B3 fix: these must never reach conn.query() as-is.
  const notExecutable = [
    "create_table_as",
    "create_view",
    "copy_to",
    "attach",
    "install_extension",
    "load_extension",
    "pragma",
    "set_var",
    "two_statements",
    "multi_statement_select_then_ddl",
    "pivot_top_level_statement",
    "non_select",
    "syntax_error",
  ];
  it.each(notExecutable)("%s is not executable", (name) => {
    const r = refs(name);
    expect(r.executable).toBe(false);
    expect(r.unresolved.length).toBeGreaterThan(0);
  });

  // A single SELECT whose content the walker cannot fully vouch for is still
  // safe to run — only export is refused (exportGate reads `unresolved`).
  const executableButUnresolvedForExport = ["table_function_range", "pivot_clause", "read_csv"];
  it.each(executableButUnresolvedForExport)("%s is executable but unresolved", (name) => {
    const r = refs(name);
    expect(r.executable).toBe(true);
    expect(r.unresolved.length).toBeGreaterThan(0);
  });

  it("a fully resolved SELECT is executable with nothing unresolved", () => {
    const r = refs("simple");
    expect(r).toEqual({ tables: ["trade_flow"], files: [], unresolved: [], executable: true });
  });
});
