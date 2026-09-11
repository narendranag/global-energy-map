import { DuckDBDataProtocol, type AsyncDuckDB } from "@duckdb/duckdb-wasm";
import { dataBytes, dataUrl } from "@/lib/data/urls";

/**
 * Register each parquet with DuckDB once (Phase 10, P4).
 *
 * Before, every `read_parquet('https://…')` went through httpfs: a HEAD plus
 * range requests per query, per file. Now each logical path
 * (`/data/assets.parquet`) is registered under that exact name the first
 * time a query references it, so the SQL keeps its hardcoded path and
 * DuckDB's virtual filesystem resolves it without touching the network
 * again.
 *
 * - Files up to BUFFER_MAX_BYTES (every parquet we ship today: 10 KB – 1.3 MB)
 *   are fetched whole with one versioned GET and handed over with
 *   `registerFileBuffer`. One request, immutable-cacheable, and the fetch
 *   starts before DuckDB has finished booting.
 * - Larger (or uncatalogued) files are registered with `registerFileURL`
 *   (HTTP, versioned URL) so DuckDB range-reads only what a query needs.
 */

/** Above this, range reads beat downloading the whole file. */
export const BUFFER_MAX_BYTES = 4 * 1024 * 1024;

export type RegistrationMode = "buffer" | "url";

export function registrationMode(path: string): RegistrationMode {
  const bytes = dataBytes(path);
  return bytes !== null && bytes <= BUFFER_MAX_BYTES ? "buffer" : "url";
}

/** `'/data/<file>.parquet'` literals referenced in a SQL string, deduplicated. */
export function referencedDataFiles(sql: string): string[] {
  const out = new Set<string>();
  for (const m of sql.matchAll(/'(\/data\/[A-Za-z0-9_.-]+\.parquet)'/g)) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

function absolute(url: string): string {
  return typeof window === "undefined" ? url : new URL(url, window.location.origin).href;
}

// Bytes are cached independently of the DB so a prefetch can overlap the boot.
const bytesCache = new Map<string, Promise<Uint8Array>>();

/** Fetch a small data file whole (versioned URL); one in-flight fetch per path. */
export function fetchDataBytes(path: string): Promise<Uint8Array> {
  let p = bytesCache.get(path);
  if (p === undefined) {
    p = (async () => {
      const res = await fetch(dataUrl(path));
      if (!res.ok) throw new Error(`${path} fetch failed: ${String(res.status)}`);
      return new Uint8Array(await res.arrayBuffer());
    })().catch((err: unknown) => {
      bytesCache.delete(path);
      throw err;
    });
    bytesCache.set(path, p);
  }
  return p;
}

const registered = new WeakMap<AsyncDuckDB, Map<string, Promise<void>>>();
/** Paths some DB has registered or is registering (there is one DB per page). */
const done = new Set<string>();

/** True when a query referencing `path` should prefetch its bytes. */
export function needsPrefetch(path: string): boolean {
  return registrationMode(path) === "buffer" && !done.has(path);
}

/**
 * Make `path` readable as `read_parquet('<path>')` in `db`. Idempotent and
 * safe to call concurrently. `bytes`, when given, is the (possibly already
 * in-flight) buffer fetch for a "buffer"-mode file.
 */
export function registerDataFile(
  db: AsyncDuckDB,
  path: string,
  bytes?: Promise<Uint8Array>,
): Promise<void> {
  let byPath = registered.get(db);
  if (!byPath) {
    byPath = new Map();
    registered.set(db, byPath);
  }
  let p = byPath.get(path);
  if (p === undefined) {
    const mode = registrationMode(path);
    // From here on, queries skip the prefetch and share this registration.
    done.add(path);
    p = (async () => {
      if (mode === "buffer") {
        const buf = await (bytes ?? fetchDataBytes(path));
        // The buffer is transferred to the worker (detached here): drop it
        // from the cache so nothing reuses it.
        bytesCache.delete(path);
        await db.registerFileBuffer(path, buf);
      } else {
        await db.registerFileURL(path, absolute(dataUrl(path)), DuckDBDataProtocol.HTTP, false);
      }
    })().catch((err: unknown) => {
      byPath.delete(path);
      throw err;
    });
    byPath.set(path, p);
  }
  return p;
}

/** Test hook. */
export function __resetDataFilesForTests(): void {
  bytesCache.clear();
  done.clear();
}
