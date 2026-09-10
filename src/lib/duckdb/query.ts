import type { Table } from "apache-arrow";
import { getDuckDB } from "./bootstrap";
import { fetchDataBytes, needsPrefetch, referencedDataFiles, registerDataFile } from "./files";
import { normalizeRows } from "./normalize";

export interface QueryResult<TRow> {
  readonly rows: readonly TRow[];
  readonly count: number;
}

/**
 * Callers write `read_parquet('/data/<file>.parquet')` with the logical path
 * hardcoded (CLAUDE.md). Before the query runs, each referenced file is
 * registered with DuckDB under that exact name (files.ts) — once per file —
 * so the SQL runs unchanged. Small files are fetched in parallel with the
 * DuckDB boot, not after it.
 */
async function prepareFiles(sql: string) {
  const files = referencedDataFiles(sql);
  const bytes = new Map(
    files
      .filter(needsPrefetch)
      .map((f) => [f, fetchDataBytes(f)] as const),
  );
  const db = await getDuckDB();
  await Promise.all(files.map((f) => registerDataFile(db, f, bytes.get(f))));
  return db;
}

export async function query<TRow extends Record<string, unknown>>(
  sql: string,
  params: readonly (string | number)[] = [],
): Promise<QueryResult<TRow>> {
  const db = await prepareFiles(sql);
  const conn = await db.connect();
  try {
    const stmt = await conn.prepare(sql);
    try {
      // DuckDB-WASM bundles apache-arrow@17 internally while the project uses
      // apache-arrow@21. The two Table types are structurally incompatible at the
      // symbol level. We cast via `unknown` to bridge the version mismatch —
      // the runtime shape is identical and toArray() works correctly.
      const arrow = (await stmt.query(...params)) as unknown as Table;
      // Plain objects with BIGINT → number (see normalize.ts): callers type
      // integer columns as `number` and never coerce.
      const fields = arrow.schema.fields.map((f) => f.name);
      const rows = normalizeRows(
        arrow.toArray() as Record<string, unknown>[],
        fields,
      ) as TRow[];
      return { rows, count: rows.length };
    } finally {
      await stmt.close();
    }
  } finally {
    await conn.close();
  }
}

export function quoteIdent(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}
