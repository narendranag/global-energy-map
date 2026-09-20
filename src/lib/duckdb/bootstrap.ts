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

/** Set when the running DuckDB core is not the one we shipped extensions for. */
let _mismatch: string | null = null;

/** The core-version mismatch message, for the console to surface; null when fine. */
export function extensionVersionMismatch(): string | null {
  return _mismatch;
}

/**
 * Autoload the parquet extension from our own origin (copied at build by
 * scripts/copy-duckdb.mjs) instead of extensions.duckdb.org.
 *
 * The repository is pointed at this origin **unconditionally**. It used to be
 * set only when the running core version matched `DUCKDB_CORE_VERSION`, and
 * on a mismatch it returned without setting anything — which left DuckDB's
 * built-in default, extensions.duckdb.org, in place. A `@duckdb/duckdb-wasm`
 * bump made without re-pinning both core versions would therefore have
 * silently reopened a third-party request path, and the privacy policy says
 * the basemap is the only third-party host the running site talks to.
 *
 * So a mismatch now fails loudly instead of quietly: the repository stays
 * same-origin, the mismatch is recorded for the UI to show, and loading
 * parquet raises DuckDB's own "extension not found" — a build error to fix,
 * not a request that leaves the origin.
 */
async function configureSelfHostedExtensions(db: duckdb.AsyncDuckDB): Promise<void> {
  const conn = await db.connect();
  try {
    const repo = extensionRepository(window.location.origin).replaceAll("'", "''");
    await conn.query(`SET GLOBAL custom_extension_repository = '${repo}'`);
    // Autoloading (as opposed to an explicit INSTALL) reads its own setting on
    // versions that have it; older cores reject it, which is not an error here.
    try {
      await conn.query(`SET GLOBAL autoinstall_extension_repository = '${repo}'`);
    } catch {
      // setting absent in this core: custom_extension_repository still applies
    }
    const rows = (await conn.query("SELECT version() AS v")).toArray() as { v: string }[];
    const running = rows[0]?.v;
    if (running !== DUCKDB_CORE_VERSION) {
      _mismatch = `DuckDB core ${String(running)} != ${DUCKDB_CORE_VERSION}: re-pin DUCKDB_CORE_VERSION and the extension sha256s in scripts/copy-duckdb.mjs and src/lib/duckdb/bundles.ts.`;
      console.error(_mismatch);
    } else {
      _mismatch = null;
    }
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
