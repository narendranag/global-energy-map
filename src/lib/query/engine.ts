import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { Table } from "apache-arrow";
import { extensionVersionMismatch, getDuckDB } from "@/lib/duckdb/bootstrap";
import { fetchDataBytes, needsPrefetch, registerDataFile } from "@/lib/duckdb/files";
import { normalizeRows } from "@/lib/duckdb/normalize";
import { referencesFromSerializedSql, type SqlReferences } from "./references";
import { createViewSql, findTable, findTableByPath, queryTables, type QueryTable } from "./tables";

/**
 * Running a console query. **This module is the only thing in the app that
 * pulls DuckDB-WASM in**, and it is imported dynamically from the /query
 * client component alone, so `/` never asks for `/duckdb/*`
 * (tests/e2e/network.spec.ts asserts it, in both directions).
 *
 * The console does not hold a schema of its own: each catalog Parquet file is
 * registered with DuckDB under its logical path and exposed as a view named
 * after the file (tables.ts), on demand. DuckDB binds a view when it is
 * created, so only the tables a query actually names are materialised — a
 * `SELECT` over `trade_flow` does not download `assets.parquet`.
 */

export type ConsoleValue = string | number | boolean | null;

export interface ConsoleResult {
  /** The SQL text that produced this result — snapshotted at RUN time so a
   * later edit to the (live) editor never lets the CSV header describe rows
   * it didn't produce. */
  readonly sql: string;
  /** The row-limit selected at RUN time, for the same reason. */
  readonly limit: number;
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, ConsoleValue>[];
  /** True when the query returned more rows than the cap and they were cut. */
  readonly truncated: boolean;
  readonly elapsedMs: number;
  /** What the query reads, per DuckDB's parse tree; drives the export gate. */
  readonly references: SqlReferences;
  /** Tables resolved from `references`, for the citation header. */
  readonly tables: readonly QueryTable[];
}

/** Strip trailing semicolons so the statement can be wrapped in a LIMIT. */
function bareStatement(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

/** Ask DuckDB to parse (not run) the SQL, and read the tables out of the tree. */
async function parseReferences(
  conn: AsyncDuckDBConnection,
  sql: string,
  tables: readonly QueryTable[],
): Promise<SqlReferences> {
  const literal = `'${sql.replaceAll("'", "''")}'`;
  try {
    const arrow = (await conn.query(
      `SELECT json_serialize_sql(${literal}) AS tree`,
    )) as unknown as Table;
    const [row] = arrow.toArray() as { tree?: unknown }[];
    const tree: unknown = typeof row?.tree === "string" ? JSON.parse(row.tree) : row?.tree;
    return referencesFromSerializedSql(tree, tables.map((t) => t.name));
  } catch (err: unknown) {
    // The json_serialize_sql call itself failed to even return a JSON
    // payload (as opposed to DuckDB reporting `error: true` inside one, which
    // `referencesFromSerializedSql` already turns into an unresolved+refused
    // result). We have no proof this is a single SELECT, so — per the same
    // rule as everything else here — it must not be run either.
    return { tables: [], files: [], unresolved: [describe(err)], executable: false };
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Why the statement must not even be executed, or `null` when it may be.
 * `references.executable` is false exactly when DuckDB's own
 * `json_serialize_sql` could not represent the text as a single SELECT
 * statement — multiple statements, or a non-SELECT one (CREATE/COPY/ATTACH/
 * INSTALL/LOAD/PRAGMA/SET, a top-level PIVOT statement, …). A single SELECT
 * whose *content* the walker cannot fully vouch for (an unmodeled table
 * function, an unmodeled table-ref kind, a qualified catalog, a CTE shadowing
 * a real table) is still safe to run — only export stays refused for those,
 * decided separately by `exportGate` reading the same `unresolved` list.
 */
export function executionRefusal(references: SqlReferences): string | null {
  if (references.executable) return null;
  return "One SELECT statement at a time — CREATE/COPY/ATTACH… are not run here.";
}

/**
 * Register the parquet files and create the views a query needs, from the
 * tables/files the parse tree actually resolved. A query whose content is
 * unresolved (e.g. `SELECT * FROM range(10)`, or a PIVOT clause) registers
 * only what it did resolve — which may be nothing, if it reads no catalogued
 * file at all — rather than every parquet in the catalog: an unresolved
 * reference already means the export gate refuses it, so there is no reader
 * left who benefits from the extra ~3.6 MB of prefetch, and a query that
 * really did need an unresolved table simply reports its own "table not
 * found", same as any other SQL mistake.
 */
async function prepareTables(
  conn: AsyncDuckDBConnection,
  refs: SqlReferences,
  all: readonly QueryTable[],
): Promise<QueryTable[]> {
  const needed = [
    ...new Set([
      ...refs.tables.flatMap((n) => findTable(n, all) ?? []),
      ...refs.files.flatMap((p) => findTableByPath(p, all) ?? []),
    ]),
  ];
  const db = await getDuckDB();
  const bytes = new Map(
    needed.filter((t) => needsPrefetch(t.path)).map((t) => [t.path, fetchDataBytes(t.path)]),
  );
  await Promise.all(needed.map((t) => registerDataFile(db, t.path, bytes.get(t.path))));
  for (const t of needed) await conn.query(createViewSql(t));
  return needed;
}

export interface RunOptions {
  /** Hard cap on rows returned to the page. */
  readonly limit: number;
}

/**
 * Run one console query. Throws with DuckDB's own message on a bad query —
 * the console shows that inline, next to the editor. A SQL typo is expected
 * input, not an application failure, so it never reaches the error boundary.
 */
export async function runConsoleQuery(sql: string, opts: RunOptions): Promise<ConsoleResult> {
  const statement = bareStatement(sql);
  if (statement === "") throw new Error("Nothing to run: the query is empty.");
  const all = queryTables();
  const db = await getDuckDB();
  const conn = await db.connect();
  const started = performance.now();
  try {
    const references = await parseReferences(conn, statement, all);
    const refusal = executionRefusal(references);
    if (refusal !== null) throw new Error(refusal);
    const prepared = await prepareTables(conn, references, all);

    // One row past the cap, so "truncated" is a fact rather than a guess.
    const capped = `SELECT * FROM (\n${statement}\n) AS _console LIMIT ${String(opts.limit + 1)}`;
    let arrow: Table;
    try {
      arrow = (await conn.query(capped)) as unknown as Table;
    } catch {
      // Not wrappable in a LIMIT subquery, even though it IS a single SELECT
      // (references.executable already ruled out anything else above — this
      // is e.g. a SELECT DuckDB's grammar does not allow inside a subquery).
      // Run it as written so the user sees their own result, or their own
      // error, never a raw non-SELECT statement.
      arrow = (await conn.query(statement)) as unknown as Table;
    }
    const columns = arrow.schema.fields.map((f) => f.name);
    const fetched = normalizeRows(arrow.toArray() as Record<string, unknown>[], columns);
    const truncated = fetched.length > opts.limit;
    return {
      sql,
      limit: opts.limit,
      columns,
      rows: fetched.slice(0, opts.limit).map(displayable),
      truncated,
      elapsedMs: Math.round(performance.now() - started),
      references,
      tables: prepared.filter(
        (t) =>
          references.tables.includes(t.name) ||
          references.files.includes(t.path),
      ),
    };
  } finally {
    await conn.close();
  }
}

/** Arrow hands back Dates, bigints and nested values; make every cell printable. */
function displayable(row: Record<string, unknown>): Record<string, ConsoleValue> {
  const out: Record<string, ConsoleValue> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "bigint") out[k] = Number(v);
    else if (v instanceof Date) out[k] = v.toISOString().slice(0, 10);
    else out[k] = stringify(v);
  }
  return out;
}

/** Anything Arrow hands back that is not a scalar (lists, structs) prints as JSON. */
function stringify(v: unknown): string {
  try {
    // JSON.stringify's type says string, but undefined comes back for
    // undefined / functions / symbols.
    const json = JSON.stringify(v) as string | undefined;
    return json ?? "";
  } catch {
    return "";
  }
}

/** Non-null when the running DuckDB core is not the one we ship extensions for. */
export function coreVersionWarning(): string | null {
  return extensionVersionMismatch();
}
