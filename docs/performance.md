# Performance and caching

Phase 10 (Track P, items 10.1 and 10.2), then lever 2 (2026-09-11). This page records what the map loads, how we measured it, what changed, and what still dominates load time.

## Since 2026-09-11: parquet is read without DuckDB

Every runtime loader — assets, reserves, LNG voyages, trade flows, route shares — was a scan plus a filter over a file of 10 KB – 1.3 MB. They now read the same parquet files with [hyparquet](https://github.com/hyparam/hyparquet) (pure JS, plus `fzstd` for our zstd pages) in `src/lib/data/parquet.ts`: each file is fetched once through its versioned URL and decoded once per column set, and the loaders filter the cached rows in memory. The rows keep the `query()` contract (BIGINT → number, DATE → `"YYYY-MM-DD"`), and `tests/unit/data/parquet.test.ts` pins the loaders against DuckDB-computed counts and sums over the shipped files.

DuckDB-WASM is no longer fetched on any page. `src/lib/duckdb/` and the self-hosted bundle (`copy-duckdb.mjs`, `public/duckdb/`) stay in the repo for the planned query console; nothing imports them at runtime today, and `tests/e2e/network.spec.ts` asserts a cold scenario load makes no `/duckdb/` request.

| Same method as below (40 Mb/s, 30 ms, median of 5, Apple Silicon Mac, Chrome headless) | DuckDB (scenario-correctness branch) | hyparquet | Target |
|---|---|---|---|
| Cold `/` | 4.85 s (4.79–4.89) | **1.20 s** (1.19–1.32) | < 3 s ✓ |
| Cold `/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023` | 5.00 s (4.88–5.41) | **1.40 s** (1.37–1.41) | < 5 s ✓ |
| Cold `/?mode=flows` | 4.91 s | **1.28 s** | — |
| Warm `/` / scenario | 1.49 / 1.61 s | 0.37 / 0.48 s | — |
| Bytes before `data-ready`, cold `/` | 18.3 MB | 4.1 MB | — |
| `/duckdb/*` requests | 3 | 0 | 0 |

Both builds were measured back to back on one machine; screenshots at `data-ready` are identical. Decoding runs on the main thread: in Node, all five files decode in under 0.3 s together.

The sections below describe the Phase 10 state (DuckDB on the load path) and are kept for the record; where they say "the app loads", read "the app loaded until 2026-09-11".

## How the app loaded (Phase 10)

1. The page's JS evaluates `src/lib/data/assets.ts`, which calls `prewarmDuckDB()`. That starts the DuckDB worker and the ~7 MB (brotli) wasm download immediately, before hydration and before the first query (P3).
2. `getDuckDB()` caches the in-flight promise, so every loader shares one worker and one instantiation. Before this change, the first-load loaders each booted their own (P1).
3. The DuckDB bundle is self-hosted. `scripts/copy-duckdb.mjs` copies the EH + MVP wasm and worker files from `node_modules/@duckdb/duckdb-wasm/dist/` into `public/duckdb/` at `predev` / `prebuild`. That directory is gitignored. `src/lib/duckdb/bundles.ts` builds the bundle map, and `selectBundle` still picks EH or MVP. The runtime makes no jsDelivr requests (P2).
4. Each parquet is registered with DuckDB once, under its logical path (`/data/assets.parquet`). The SQL keeps the hardcoded path and needs no rewrite (P4, `src/lib/duckdb/files.ts`):
   - Files up to 4 MB (`BUFFER_MAX_BYTES`) are fetched whole with one GET and registered with `registerFileBuffer`. The fetch starts when the query is issued, in parallel with the DuckDB boot.
   - Larger or uncatalogued files are registered with `registerFileURL(…, HTTP, directIO=false)`, so DuckDB range-reads only what a query needs.

   | File | Bytes | Mode |
   |---|---|---|
   | `assets.parquet` | 1.25 MB | buffer |
   | `trade_flow.parquet` | 758 KB | buffer |
   | `lng_voyage.parquet` | 275 KB | buffer |
   | `country_year_series.parquet` | 40 KB | buffer |
   | `disruption_route.parquet` | 10 KB | buffer |

   Before this change, each query read through httpfs: a HEAD plus range requests for every file on every query (for example, `assets.parquet` ×3 and `country_year_series.parquet` ×3 on `/`). Now each file costs one request per page load, and zero on a revisit.
5. Every runtime data URL is versioned (P5). `dataUrl('/data/x.parquet')` returns `/data/x.parquet?v=<first 8 hex of sha256>`, reading the hash from the bundled `catalog.json`. Only the hash comes from the catalog; logical paths stay hardcoded. GeoJSON sidecars go through `fetchJson`, which versions them; `countries.geojson` uses `dataUrl` directly. The DuckDB files carry `?v=<@duckdb/duckdb-wasm version>`.
6. `next.config.ts` `headers()` sets:
   - `/data/*` and `/duckdb/*` **with** `?v=`: `Cache-Control: public, max-age=31536000, immutable`.
   - The same paths **without** `?v=`: `public, max-age=0, must-revalidate`. This covers `/data/catalog.json`, the download links on `/data`, and any path the catalog has no hash for (`dataUrl` leaves those unversioned).

**Rule: never change a file in `public/data/` without regenerating `catalog.json`.** The sha256 in the catalog is the cache key. A file whose bytes change while its hash stays the same would be served stale for a year. `tests/unit/data/urls.test.ts` asserts that every runtime catalog entry has a sha256, that no source file fetches `/data/…` directly, and that every hardcoded `/data/*.parquet|geojson` path has a catalog hash.

## Method

- **Hardware:** Apple M1, 8 GB, macOS 26.6.2, Google Chrome 152 (headless, `channel: "chrome"`, 1440×900).
- **Build:** production (`pnpm build && next start`). "Before" is a clean clone of `phase-10-launch` at `8f81dcd`; "after" is the same commit plus only the Track P changes. Both builds ran in scratch directories so they did not disturb the shared `.next/`.
- **Cold:** each run uses a fresh on-disk Chrome profile, so the HTTP cache starts empty. **Warm:** a second page load in the same profile.
- **Ready:** time from navigation start until `main[data-ready="true"]` has held for 500 ms (it can flicker).
- **Network:** CDP `Network.emulateNetworkConditions` at 40 Mb/s down, 10 Mb/s up, 30 ms RTT ("desktop broadband"). It applies to the page and its dedicated worker.
- **CDN emulation:** a small proxy in front of `next start` serves `/data`, `/duckdb` and `/_next/static` from memory with brotli at quality 4. Quality 4 is the setting that reproduces jsDelivr's 7,087,051-byte `duckdb-eh.wasm` exactly. Without the proxy, `next start` gzips the 36 MB wasm on every request: that costs about 1.1 s of server CPU and 8.1 MB on the wire, which penalises the self-hosted build unfairly. Vercel's CDN compresses `application/wasm` with brotli and caches the result.
- **Bytes and requests:** Playwright `request.sizes()` (body plus headers), taken from `requestfinished` events, which include the worker's requests.
- Five runs per URL at 40 Mb/s, three at the other speeds. Medians are reported.

## Results

Cold and warm times are the median time to `data-ready`. Requests are counts of `/data/*` requests.

| Scenario (40 Mb/s, 30 ms) | Before | After | Target |
|---|---|---|---|
| Cold `/` | **7.0 s** (6.7–7.2) | **5.8 s** (5.7–6.0) | < 3 s |
| Cold `/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023` | **7.8 s** (7.1–8.5) | **6.2 s** (6.1–6.2) | < 5 s |
| Warm `/` | 2.8 s | 1.9 s | — |
| Warm scenario URL | 3.8 s | 2.0 s | — |
| `/data/*` requests, cold `/` / scenario | 8 / 17 (httpfs HEAD + ranges) | 4 / 7 (one GET per file) | — |
| Revisit: `/data` + `/duckdb` bytes re-downloaded | 2–4 KB (8 / 17 conditional requests, all 304) | **0 bytes, 0 requests** (disk cache, immutable) | ≈ 0 |
| jsDelivr requests per load | 4 / 10 | **0** | 0 |
| DuckDB workers booted | 2 on `/`, 5 on the scenario URL | 1 | 1 |

Other speeds (median, cold / warm):

| | Before `/` | After `/` | Before scenario | After scenario |
|---|---|---|---|---|
| 100 Mb/s, 20 ms | 4.7 / 2.3 s | 4.1 / 2.0 s | 5.5 / 3.2 s | 5.0 / 2.1 s |
| Unthrottled (loopback + real internet for third parties) | 3.1 / 2.2 s | 3.5 / 2.5 s | 3.5 / 2.9 s | 2.3 / 1.9 s |

Unthrottled runs are noisy (±0.8 s): the M1 is CPU-bound there, on wasm compile and deck.gl layer builds.

**Final (after self-hosting the parquet extension, 2026-09-10, same method, 5 runs, 40 Mb/s / 30 ms):** cold `/` **5.0 s** (5.03–5.09), cold scenario URL **5.2 s** (5.23–5.30); warm 1.4 s / 1.3 s; cold transfer ≈ 19.5 / 20.5 MB (DuckDB 7.8 MB, data 4.5 / 5.5 MB, rest basemap tiles + app JS); 0 jsDelivr and 0 extensions.duckdb.org requests; revisit re-downloads 0 bytes of `/data`. Net vs. the Phase 9 baseline: −2.0 s (`/`) and −2.6 s (scenario). The scenario target (< 5 s) is missed by ~0.2 s and the `/` target (< 3 s) by ~2 s — both are now bound by bytes on the wire (lever 2 below).

The warm-revisit target is met, and the jsDelivr dependency is gone. Cold load improved by 1.2–1.6 s at broadband speeds but still misses the < 3 s and < 5 s targets. The next section explains why.

## What dominates the remaining cold time

Timeline for cold `/` at 40 Mb/s (after):

| t (ms) | Event |
|---|---|
| 0–400 | HTML and JS chunks |
| 413 | DuckDB worker requested (prewarm, before hydration) |
| 553 | parquet and GeoJSON fetches start, in parallel with the wasm |
| 830–2 600 | basemap vector tiles and fonts (OpenFreeMap), **6.4 MB** |
| 2 616 | `assets.parquet` done (1.25 MB) |
| 3 453 | `pipelines.geojson` done (3.0 MB brotli) |
| 4 689 | `duckdb-eh.wasm` done (**7.1 MB**) |
| 4 689–5 296 | wasm compile and instantiate (~0.6 s) |
| 5 296–5 862 | `parquet.duckdb_extension.wasm` from **extensions.duckdb.org** (0.7 MB, serial) |
| ~6 370 | queries run, layers built, `data-ready` |

Since measured: `build_pipelines.py` now merges line fragments before simplifying, so `pipelines.geojson` is 7.7 MB raw (was 14 MB; brotli 1.9 → 1.2 MB) with half the vertices, and the gas layer no longer draws a second, transparent 8 px hit band (hover uses the overlay's `pickingRadius`). Under software WebGL a gas-pipeline frame fell from ~6.9 s to ~1.8 s (Mac, SwiftShader) — the cause of the Linux CI e2e timeouts.

About 18 MB crosses the wire before `data-ready`: basemap 6.4, wasm 7.1, pipelines 3.0, parquet and countries 1.5. At 40 Mb/s that alone takes about 3.6 s, and a serial tail of about 1.7 s follows (instantiate, then the extension fetch, then query and render). Under 3 s at 40 Mb/s is not reachable while DuckDB-WASM is on the critical path.

## Next levers, in order of payoff

1. ~~**Self-host the parquet extension.**~~ **Done** (maintainer-approved): `copy-duckdb.mjs` downloads the signed `parquet` extension for core v1.5.1 at build, verifies sha256, and the bootstrap sets `custom_extension_repository` to `/duckdb/extensions` (≈ −0.8 s cold).
2. ~~**Take DuckDB off the first-paint path.**~~ **Done** (2026-09-11, maintainer-approved) — further than planned: every loader, not just the default layers, reads parquet with hyparquet (see the top of this page). Cold `/` 4.85 → 1.20 s.
3. **Pipelines as PMTiles** (tippecanoe → MVT). Replaces 3 MB of GeoJSON, blurred by simplification, with range-read tiles of full detail.
4. ~~Preload `duckdb-eh.wasm`~~ — moot now that the wasm is not loaded. The equivalent for today would be preloading `assets.parquet?v=…`.
5. **Basemap bytes.** 6.4 MB of z2 vector tiles and glyphs from OpenFreeMap share the pipe with everything else. They come from a third party and are immutable-cached by the provider, so there is little to gain here beyond style choices.

## Deploy notes

- `public/duckdb/` is about 77 MB uncompressed (EH 36 MB + MVP 41 MB wasm). It is still generated on Vercel by `prebuild` and never committed, but since 2026-09-11 no page requests it: it is staged for the planned query console. (Until then, a browser downloaded one of the two files, about 7 MB brotli.)
- After deploying, check the caching: `curl -sI 'https://<host>/data/assets.parquet?v=<sha8>'` should show `immutable`, and the same URL without `?v=` should show `max-age=0, must-revalidate`.
