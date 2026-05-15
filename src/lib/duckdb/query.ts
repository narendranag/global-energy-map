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
    // apache-arrow's Table.toArray() is typed as `any[]`; we trust the SQL
    // schema matches TRow at the call site — an unavoidable cast given the
    // library's loose return type.
    const arrow = (await stmt.query(...params)) as Table;
    const rows = arrow.toArray() as TRow[];
    return { rows, count: rows.length };
  } finally {
    await conn.close();
  }
}

export function quoteIdent(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}
