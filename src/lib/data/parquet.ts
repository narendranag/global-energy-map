import { decompress as zstdDecompress } from "fzstd";
import { parquetReadObjects, type Compressors } from "hyparquet";
import { dataUrl } from "./urls";

/**
 * Read a shipped parquet file straight into plain row objects (hyparquet),
 * without DuckDB-WASM (performance lever 2, 2026-09-11).
 *
 * Every runtime loader is a scan plus a filter over a file of 10 KB – 1.3 MB,
 * so the 7 MB wasm, its compile and the extension fetch bought nothing on
 * the load path. Each file is fetched once through its versioned,
 * immutable-cacheable URL (urls.ts) and decoded once; loaders filter the
 * cached rows in memory. Paths stay hardcoded at the call site (CLAUDE.md).
 *
 * Rows come back with the same shape `query()` produced: BIGINT → number
 * (every integer we store is far below 2^53) and DATE → "YYYY-MM-DD".
 */

/** Every file we ship is zstd-compressed (pyarrow `compression="zstd"`). */
const COMPRESSORS: Compressors = {
  ZSTD: (input: Uint8Array, outputLength: number) =>
    zstdDecompress(input, new Uint8Array(outputLength)),
};

export type ParquetRow = Record<string, unknown>;

/** BIGINT → number, Date → ISO date, missing → null; everything else unchanged. */
export function normalizeParquetValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

/** Decode parquet bytes into plain rows with only `columns`, normalised. */
export async function decodeParquet(
  bytes: ArrayBuffer,
  columns: readonly string[],
): Promise<ParquetRow[]> {
  const rows = (await parquetReadObjects({
    file: bytes,
    columns: [...columns],
    compressors: COMPRESSORS,
  })) as ParquetRow[];
  for (const row of rows) {
    for (const c of columns) row[c] = normalizeParquetValue(row[c]);
  }
  return rows;
}

const bytesCache = new Map<string, Promise<ArrayBuffer>>();
const rowsCache = new Map<string, Promise<readonly ParquetRow[]>>();

/** Memoise a promise under `key`; a rejection is evicted so the next call retries. */
function memo<T>(cache: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (p === undefined) {
    p = make().catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, p);
  }
  return p;
}

function fetchBytes(path: string): Promise<ArrayBuffer> {
  return memo(bytesCache, path, async () => {
    const res = await fetch(dataUrl(path));
    if (!res.ok) throw new Error(`${path} fetch failed: ${String(res.status)}`);
    return res.arrayBuffer();
  });
}

/**
 * All rows of `/data/<file>.parquet` with `columns`. The file is fetched once
 * per page and decoded once per column set; every loader asking for the same
 * columns shares the rows (treat them as read-only).
 */
export function readParquet<T extends object>(
  path: string,
  columns: readonly (keyof T & string)[],
): Promise<readonly T[]> {
  const key = `${path} ${columns.join(",")}`;
  return memo(rowsCache, key, async () => decodeParquet(await fetchBytes(path), columns)) as Promise<
    readonly T[]
  >;
}

/** Test hook. */
export function __resetParquetCacheForTests(): void {
  bytesCache.clear();
  rowsCache.clear();
}
