#!/usr/bin/env node
// Put public/duckdb/duckdb-{eh,mvp}.wasm into R2 under duckdb/<package version>/, where
// cloudflare/worker.mjs serves them. Re-uploading the same version is harmless.
//   node scripts/cloudflare/upload-duckdb-wasm.mjs           # the real bucket
//   node scripts/cloudflare/upload-duckdb-wasm.mjs --local   # wrangler dev's local bucket
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BUCKET = "global-energy-map-assets";
const FILES = ["duckdb-eh.wasm", "duckdb-mvp.wasm"];
const where = process.argv.includes("--local") ? "--local" : "--remote";

const root = process.cwd();
const version = JSON.parse(
  readFileSync(join(root, "node_modules/@duckdb/duckdb-wasm/package.json"), "utf8"),
).version;

for (const file of FILES) {
  const path = join(root, "public", "duckdb", file);
  if (!existsSync(path)) {
    console.error(`upload-duckdb-wasm: ${path} is missing; run \`pnpm copy-duckdb\` first`);
    process.exit(1);
  }
  const key = `${BUCKET}/duckdb/${version}/${file}`;
  console.log(`upload-duckdb-wasm: ${key} (${where})`);
  execFileSync(
    "pnpm",
    ["exec", "wrangler", "r2", "object", "put", key, "--file", path, "--content-type", "application/wasm", where],
    { stdio: "inherit" },
  );
}
