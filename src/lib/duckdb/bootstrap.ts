import * as duckdb from "@duckdb/duckdb-wasm";
import { DUCKDB_CORE_VERSION, extensionRepository, selfHostedBundles } from "./bundles";

/**
 * The in-flight promise is cached, not the resolved DB (Phase 10, P1): the
 * first-load loaders all call this in the same tick, and caching the value
 * made each of them spawn a worker and download + instantiate the ~7 MB
 * wasm. A rejected boot is evicted so a later call retries.
 */
let _db: Promise<duckdb.AsyncDuckDB> | undefined;

async function boot(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(
    selfHostedBundles(window.location.origin, duckdb.PACKAGE_VERSION),
  );
  if (!bundle.mainWorker) throw new Error("DuckDB bundle has no worker");
  // Same-origin classic worker: no blob/importScripts shim needed.
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  } catch (err) {
    worker.terminate();
    throw err;
  }
  await configureSelfHostedExtensions(db);
  return db;
}

/**
 * Autoload the parquet extension from our own origin (copied at build by
 * scripts/copy-duckdb.mjs) instead of extensions.duckdb.org. Only when the
 * running core version matches the one we downloaded for; otherwise keep
 * DuckDB's default repository so a version bump degrades, not breaks.
 */
async function configureSelfHostedExtensions(db: duckdb.AsyncDuckDB): Promise<void> {
  const conn = await db.connect();
  try {
    const rows = (await conn.query("SELECT version() AS v")).toArray() as { v: string }[];
    const running = rows[0]?.v;
    if (running !== DUCKDB_CORE_VERSION) {
      console.warn(
        `DuckDB core ${String(running)} != ${DUCKDB_CORE_VERSION}; loading extensions from the default repository`,
      );
      return;
    }
    const repo = extensionRepository(window.location.origin).replaceAll("'", "''");
    await conn.query(`SET GLOBAL custom_extension_repository = '${repo}'`);
  } finally {
    await conn.close();
  }
}

export function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  _db ??= boot().catch((err: unknown) => {
    _db = undefined;
    throw err;
  });
  return _db;
}

/**
 * Start booting DuckDB now (worker + wasm download) without waiting on it,
 * so the download overlaps the GeoJSON sidecar fetches (P3). Browser only;
 * a failure here is swallowed — the first real query retries and reports.
 */
export function prewarmDuckDB(): void {
  if (typeof window === "undefined" || typeof Worker === "undefined") return;
  getDuckDB().catch(() => undefined);
}

/** Test hook: forget the cached instance. */
export function __resetDuckDBForTests(): void {
  _db = undefined;
}
