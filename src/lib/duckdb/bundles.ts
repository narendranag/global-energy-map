import type { DuckDBBundles } from "@duckdb/duckdb-wasm";

/**
 * Self-hosted DuckDB-WASM bundles (Phase 10, P2). `scripts/copy-duckdb.mjs`
 * copies these files from `node_modules/@duckdb/duckdb-wasm/dist/` into
 * `public/duckdb/` at `predev` / `prebuild` (gitignored), so the runtime
 * never touches jsDelivr. Served as plain static files — never bundled
 * imports (Turbopack + workers + wasm).
 *
 * The `?v=<package version>` query makes the immutable cache header on
 * `/duckdb/*` safe across upgrades (next.config.ts).
 */

export const DUCKDB_PUBLIC_DIR = "/duckdb";

/**
 * DuckDB core version inside the pinned @duckdb/duckdb-wasm build. Extensions
 * are built per core version, so the copy script downloads the signed parquet
 * extension for exactly this version into `public/duckdb/extensions/` and the
 * bootstrap points DuckDB there (no runtime request to extensions.duckdb.org).
 * Bump together with `DUCKDB_CORE_VERSION` in scripts/copy-duckdb.mjs.
 */
export const DUCKDB_CORE_VERSION = "v1.5.1";

/** `custom_extension_repository` value: `<repo>/<version>/<platform>/<name>.duckdb_extension.wasm`. */
export function extensionRepository(origin: string): string {
  return `${origin}${DUCKDB_PUBLIC_DIR}/extensions`;
}

/** Files the copy script must place in `public/duckdb/` (EH + MVP; no COI). */
export const DUCKDB_FILES = [
  "duckdb-eh.wasm",
  "duckdb-browser-eh.worker.js",
  "duckdb-mvp.wasm",
  "duckdb-browser-mvp.worker.js",
] as const;

export function selfHostedBundles(origin: string, version: string): DuckDBBundles {
  const url = (file: (typeof DUCKDB_FILES)[number]) =>
    `${origin}${DUCKDB_PUBLIC_DIR}/${file}?v=${encodeURIComponent(version)}`;
  return {
    mvp: {
      mainModule: url("duckdb-mvp.wasm"),
      mainWorker: url("duckdb-browser-mvp.worker.js"),
    },
    eh: {
      mainModule: url("duckdb-eh.wasm"),
      mainWorker: url("duckdb-browser-eh.worker.js"),
    },
  };
}
