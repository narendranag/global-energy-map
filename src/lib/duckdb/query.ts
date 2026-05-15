import type { Table } from "apache-arrow";
import { getDuckDB } from "./bootstrap";

export interface QueryResult<TRow> {
  readonly rows: readonly TRow[];
  readonly count: number;
}

/**
 * Rewrite `/data/...` paths in SQL to absolute HTTP URLs so DuckDB-WASM
 * can fetch them via its built-in HTTPFS. This allows callers to use
 * convenient root-relative paths (e.g. `/data/foo.parquet`) that work
 * both in dev and production regardless of hostname/port.
 */
function resolveParquetPaths(sql: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return sql.replace(/'\/data\//g, `'${origin}/data/`);
}

export async function query<TRow extends Record<string, unknown>>(
  sql: string,
  params: readonly (string | number)[] = [],
): Promise<QueryResult<TRow>> {
  const db = await getDuckDB();
  const conn = await db.connect();
  const resolvedSql = resolveParquetPaths(sql);
  try {
    const stmt = await conn.prepare(resolvedSql);
    // DuckDB-WASM bundles apache-arrow@17 internally while the project uses
    // apache-arrow@21. The two Table types are structurally incompatible at the
    // symbol level. We cast via `unknown` to bridge the version mismatch —
    // the runtime shape is identical and toArray() works correctly.
    const arrow = (await stmt.query(...params)) as unknown as Table;
    const rows = arrow.toArray() as TRow[];
    return { rows, count: rows.length };
  } finally {
    await conn.close();
  }
}

export function quoteIdent(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}
