#!/usr/bin/env node
// Copy the DuckDB-WASM browser bundles (EH + MVP wasm and their workers) from
// node_modules into public/duckdb/ so the app serves them itself instead of
// loading them from jsDelivr at runtime (Phase 10, P2). Runs at predev /
// prebuild; the output is gitignored. Keep the file list in sync with
// DUCKDB_FILES in src/lib/duckdb/bundles.ts (a unit test checks).
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DUCKDB_FILES = [
  "duckdb-eh.wasm",
  "duckdb-browser-eh.worker.js",
  "duckdb-mvp.wasm",
  "duckdb-browser-mvp.worker.js",
];

export function copyDuckdb() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const require = createRequire(join(root, "package.json"));
  const src = dirname(require.resolve("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm"));
  const dest = join(root, "public", "duckdb");
  const version = JSON.parse(readFileSync(join(src, "..", "package.json"), "utf8")).version;
  // Stamp the package version: an upgrade recopies everything even if a
  // file's size happens not to change.
  const stamp = join(dest, ".version");
  const current = existsSync(stamp) && readFileSync(stamp, "utf8").trim() === version;

  mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const file of DUCKDB_FILES) {
    const from = join(src, file);
    const to = join(dest, file);
    if (current && existsSync(to) && statSync(to).size === statSync(from).size) continue;
    copyFileSync(from, to);
    copied += 1;
  }
  writeFileSync(stamp, `${version}\n`);
  console.log(
    `copy-duckdb: ${String(copied)} copied, ${String(DUCKDB_FILES.length - copied)} up to date → public/duckdb/ (@duckdb/duckdb-wasm ${version})`,
  );
}

// Run only when executed directly (the unit test imports DUCKDB_FILES).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) copyDuckdb();
