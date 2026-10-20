#!/usr/bin/env node
// After `opennextjs-cloudflare build`: the asset-store files that only Workers reads.
//   .assetsignore  the DuckDB wasm modules (over the 25 MiB per-asset limit; served from R2)
//   _headers       /_next/static/* is content-hashed, so cache it for a year
// Written into .open-next/assets/ rather than public/, so `next dev` never serves them.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".open-next", "assets");
if (!existsSync(dir)) {
  console.error("prepare-assets: .open-next/assets is missing; run `opennextjs-cloudflare build` first");
  process.exit(1);
}
writeFileSync(join(dir, ".assetsignore"), "duckdb/*.wasm\n");
writeFileSync(
  join(dir, "_headers"),
  "/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n",
);
console.log("prepare-assets: wrote .assetsignore and _headers");
