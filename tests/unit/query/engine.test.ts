import { describe, expect, it } from "vitest";
import { executionRefusal } from "@/lib/query/engine";
import { referencesFromSerializedSql } from "@/lib/query/references";
import fixtures from "./fixtures/serialized-sql.json";

/**
 * B3: `runConsoleQuery` must refuse to EXECUTE anything the parse does not
 * resolve as a single SELECT-type statement, not just refuse to export it.
 * `executionRefusal` is the pure decision the engine makes before ever
 * calling `conn.query()` on the raw statement — tested here against DuckDB's
 * own recorded parse trees (see references.test.ts for the fuller picture).
 */

interface Fixtures {
  readonly trees: Record<string, unknown>;
}
const { trees } = fixtures as unknown as Fixtures;

const refs = (name: string) => {
  const tree = trees[name];
  expect(tree, `missing fixture: ${name}`).toBeDefined();
  return referencesFromSerializedSql(tree);
};

describe("executionRefusal", () => {
  it("refuses CREATE TABLE AS", () => {
    expect(executionRefusal(refs("create_table_as"))).toMatch(
      /One SELECT statement at a time — CREATE\/COPY\/ATTACH… are not run here\./,
    );
  });

  it.each([
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
  ])("refuses to run %s", (name) => {
    expect(executionRefusal(refs(name))).not.toBeNull();
  });

  it.each(["simple", "join", "read_parquet_direct", "table_function_range", "pivot_clause", "read_csv"])(
    "lets %s run (a single SELECT, whatever export decides later)",
    (name) => {
      expect(executionRefusal(refs(name))).toBeNull();
    },
  );
});
