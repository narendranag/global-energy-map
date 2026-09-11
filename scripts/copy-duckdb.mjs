#!/usr/bin/env node
// Copy the DuckDB-WASM browser bundles (EH + MVP wasm and their workers) from
// node_modules into public/duckdb/ so the app serves them itself instead of
// loading them from jsDelivr at runtime (Phase 10, P2). Runs at predev /
// prebuild; the output is gitignored. Keep the file list in sync with
// DUCKDB_FILES in src/lib/duckdb/bundles.ts (a unit test checks).
import { createHash } from "node:crypto";
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

// DuckDB's signed parquet extension for the core version inside the pinned
// @duckdb/duckdb-wasm build (keep in sync with src/lib/duckdb/bundles.ts).
// Downloaded once from extensions.duckdb.org at build time and verified
// against these hashes, so the browser never fetches it from a third party.
export const DUCKDB_CORE_VERSION = "v1.5.1";
export const PARQUET_EXTENSIONS = [
  { platform: "wasm_eh", sha256: "82dc14353de0d518f5824a799e69aedcc05eea82ff1a8d1814715ecf72bfc951" },
  { platform: "wasm_mvp", sha256: "625d6db32ca5cecbeb4a27bc700d312d89dc27c9fa948865211ec6f1e386b222" },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export async function fetchExtensions(dest) {
  let fetched = 0;
  for (const { platform, sha256: want } of PARQUET_EXTENSIONS) {
    const rel = join(DUCKDB_CORE_VERSION, platform, "parquet.duckdb_extension.wasm");
    const to = join(dest, "extensions", rel);
    if (existsSync(to) && sha256(readFileSync(to)) === want) continue;
    const url = `https://extensions.duckdb.org/${DUCKDB_CORE_VERSION}/${platform}/parquet.duckdb_extension.wasm`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`copy-duckdb: ${url} -> HTTP ${String(res.status)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== want) throw new Error(`copy-duckdb: sha256 mismatch for ${url} (got ${got})`);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, buf);
    fetched += 1;
  }
  console.log(
    `copy-duckdb: parquet extension ${DUCKDB_CORE_VERSION}: ${String(fetched)} downloaded, ${String(PARQUET_EXTENSIONS.length - fetched)} up to date`,
  );
}

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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  copyDuckdb();
  const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "duckdb");
  await fetchExtensions(dest).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1; // a build without the extension would fail at query time
  });
}
