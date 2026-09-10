import * as duckdb from "@duckdb/duckdb-wasm";
import { selfHostedBundles } from "./bundles";

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
  return db;
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
