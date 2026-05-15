import type { Table } from "apache-arrow";
import { getDuckDB } from "./bootstrap";

export interface QueryResult<TRow> {
  readonly rows: readonly TRow[];
  readonly count: number;
}

export async function query<TRow extends Record<string, unknown>>(
  sql: string,
  params: readonly (string | number)[] = [],
): Promise<QueryResult<TRow>> {
  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    const stmt = await conn.prepare(sql);
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
