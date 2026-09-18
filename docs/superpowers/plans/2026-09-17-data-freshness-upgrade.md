# Data freshness upgrade — free sources (implementation plan)

> **Context:** `docs/commercial-data-options.md` §4 scenario A. Paid data is ruled out for now on licensing grounds, not cost; this plan takes the recency win that is available for free.
> **Branch:** `data-freshness` → PR to `main`.
> **Goal:** close the staleness gap. Today the map shows 2023 extraction sites, reserves frozen at 2020, and trade flows with a ~2-year lag, while presenting itself as a current picture of the energy system.
> **Out of scope:** paid sources, new commodities (coal), AIS/tanker layers, PMTiles, the query console.

## Why now

Extraction sites are pinned to GEM's **July 2023** release. Reserves stop at 2020. BACI trade flows lag ~2 years. None of that is visible to a visitor beyond a small as-of line, and the site's whole claim is that it is an inspectable current picture.

While verifying upstream availability for this plan I also found that **the GEM ingests are already broken** (§1.1). That moves this from "nice improvement" to "the refresh path does not currently work", and it sets the priority order below.

## 1. Verified findings (checked 2026-09-17)

### 1.1 The GEM ingests are broken — P0

GEM reorganised its public DigitalOcean bucket (folder markers under `Current_maps/` are dated **2026-07-02**). Both pinned download URLs now return **404**:

```
https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/ggit/2026-03/ggit_map_2026-02-20.geojson  → 404
https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/GOIT/2025-03/goit_2025-04-09.geojson      → 404
```

A bucket listing confirms the old `ggit/`, `GOIT/` and `goget/` top-level prefixes are gone; the new `Current_maps/{goit,ggit,goget}/` folders contain only directory markers, so the data is not simply moved one level down.

**This does not affect the deployed site** — `public/data/` is committed and serving fine. It breaks `scripts.ingest.gem_oil_infra`, `scripts.ingest.gem_gas_infra`, `build_all --ingest`, and therefore any refresh, and a fresh clone's first build.

Candidate replacement found: the GreenInfo tracker map serves a live CSV at
`https://greeninfo-network.github.io/global-oil-infrastructure-tracker/static/data/data.csv`
(HTTP 200, 767 KB, 1,018 rows, columns `project, unit, type, parent, countries, status, start_year, capacity, geom, route, url`). **Shape differs from the GeoJSON we ingest today** — it carries `geom`/`route` rather than GeoJSON features, and 1,018 rows is far fewer than the current pipeline table, so it is likely a map-display subset. Treat it as a fallback, not a drop-in.

GEM's own citation line now reads "Global Oil Infrastructure Tracker, Global Energy Monitor, **June 2026** release" — newer than our pinned 2025-04-09, so a current release exists somewhere; we just need the durable URL.

### 1.2 Energy Institute 2026 edition exists

The **75th edition (2026)** is published; we pin 2025. The downloads page returns **HTTP 403** to scripted fetches (Cloudflare), exactly as `docs/refresh.md` already warns, so this stays a manual download.

Open question the refresh must answer: **did EI publish reserves past 2020 this year?** If so, `test_reserves_end_2020_and_non_negative` and the "reserves frozen after 2020" badge both change. If not, nothing about reserves improves and we should say so more loudly in the UI (§4).

### 1.3 GGIT is current

The newest GGIT release referenced in GEM's map config is `ggit_map_2026-02-20.geojson` — the one we already pin. No content upgrade available; only the URL needs repair (§1.1).

### 1.4 New free sources — all three reachable

| Source | Probe result | Auth | Recency gain |
|---|---|---|---|
| **UN Comtrade** (`comtradeapi.un.org/public/v1/preview/`) | **200, no key**, real HS 2709 rows; monthly `202512` → 21 rows, `202603` → 22 rows | none for preview tier | **~6-month lag vs BACI's ~2 years** |
| **GIE AGSI/ALSI** (`agsi.gie.eu/api`) | 200, `"Invalid or missing API key"` — endpoint live | free registration key | **daily** EU gas storage + LNG send-out, published 19:30 |
| **EIA API v2** (`api.eia.gov/v2/`) | 403 `API_KEY_MISSING` with registration link — endpoint live | free key (`EIA_API_KEY`, already noted in CLAUDE.md as not yet obtained) | weekly/monthly US series, plus the deferred STEO basin data |

Operational constraint found by probing: the keyless Comtrade preview tier **rate-limits (HTTP 429)** under modest sequential use. Any ingest must throttle and cache, or register for a key.

Licence notes: GIE requires attribution as "GIE AGSI / ALSI" beneath the data or in the feed name — compatible with our footer and catalog conventions. EIA is US government work. Comtrade terms must be read before we mark anything `downloadable` in the catalog.

## 2. Track 0 — Unbreak the GEM ingests (P0, blocks everything)

**0.1** Find the durable current URLs for GOIT and GGIT. Order to try: GEM's own download page (`globalenergymonitor.org/download-data`), the `GlobalEnergyMonitor/goit-ggit-data-ops` repo tooling (`releases/downloads/pipeline_exports.py` documents how release artifacts are produced; the data files themselves are not committed), then the tracker map pages' live bundles, then a Wayback pin as the GOGET pin already does.

**0.2** Re-pin `GEM_GOIT` and `GEM_GGIT` in `scripts/common/sources.py`. If GOIT's June 2026 release is only available in the CSV shape from §1.1, that is a transform change, not just a pin change — scope it before committing to it.

**0.3** Add a **pin liveness test**. A `tests/python` check that issues a `HEAD`/range request for every `SourcePin.download_url` and fails on 404, marked so it can be skipped offline (`-m network`). This exact failure was silent for ~2.5 months; the test is the actual fix.

**0.4** Record the URL change and the bucket reorganisation in `docs/refresh.md` under the GEM section, including the bucket-listing trick used to diagnose it.

**Done:** `build_all --ingest` completes from a clean `data/raw/`; the liveness test passes; `public/data/` rebuilds byte-identically where the upstream release is unchanged.

## 3. Track A — Refresh existing pins (no new code)

Follow the per-source procedure in `docs/refresh.md` for each. These are independent and can be done in any order after Track 0.

**A.1 — EI 2026 (75th edition).** Manual download (Cloudflare). Set `release`/`as_of`/`download_url`. Watch `build_country_year` for unmapped country names (`EI_NAME_TO_ISO3`). **Explicitly determine the reserves end-year** and update the test and badge if it moved. Production data should extend 2024 → 2025.

**A.2 — GEM GOGET.** Our oldest pin by far (July 2023). Find the current release; the `goget` CDN path referenced by the tracker config (`Oil & Gas Extraction-map-file-2025-02-26.csv`) returns `NoSuchKey`, so the config is stale too — same hunt as Track 0. A newer release changes site counts and `commissioned_year` coverage (22% today), which feeds the vintage filter.

**A.3 — NETL re-snapshot.** Live unversioned ArcGIS layers, pinned to a 2026-05-17 retrieval. Re-run `netl_gogi`, bump the pin to the new retrieval date, and diff the basin/storage/port counts. Watch that the EPA non-storage filter (storage 26,102 → 7,733) still selects correctly against refreshed records.

**A.4 — OSM re-snapshot.** Re-query Overpass, bump the pin. Re-check the 2 km cross-source refinery dedup against NETL; the count (88 OSM rows) will move.

**A.5 — BACI.** `V202601` is current; confirm no newer release. If one appears, note that the ingest range-reads the zip and its byte offsets are release-specific (`_ZIP_FILE_SIZE`, `_YEAR_ENTRIES`, `_CC_*`).

**Done:** every pin is either current or has a documented reason it is not; `build_all` green; `catalog.json` regenerated in the same commit; changelog entry written.

## 4. Track B — New free near-real-time sources

Each follows the established pattern exactly: one ingest under `scripts/ingest/`, one transform under `scripts/transform/`, a `SourcePin`, a `catalog.json` entry, a hardcoded path in a `src/lib/data/` loader, symbology in `src/lib/symbology/`, a `formatXTooltip`, and a Legend entry. No runtime provider calls.

**B.1 — GIE AGSI/ALSI — DONE 2026-09-17** (`def9686`, layer in `4dcda2f`): 188,767 rows, 22 countries, daily, 2020-01-01 → present. Country level only; terminal-level deferred because ALSI facility names join to ours at only ~71 %. Ships as the "live" gas-storage choropleth (latest gas day, independent of the year slider). Original item:

**B.1 — GIE AGSI/ALSI (highest value).** Daily EU gas storage fullness and LNG terminal send-out. This is the single biggest recency upgrade available for free: it turns the LNG layer from a static 2020–24 archive into something current for Europe. Register the key, add `GIE_API_KEY` to `~/.config/secrets.env`, build a `storage_daily` / `lng_terminal_daily` table keyed to existing terminal names where they join (name is already the runtime join key for LNG). Attribution string "GIE AGSI / ALSI" into the catalog and the footer.

**B.2 — UN Comtrade monthly — DONE 2026-09-17** (`8385c11`): 8,839 rows, crude + LNG imports, 2025-01 → 2026-05, keyed API (one call returns every reporter). Importer-declared, never merged with BACI; months under 50 reporters dropped as reporting lag. Data pipeline only — no map layer yet, since showing a monthly as-reported series beside the annual reconciled one is a presentation decision. The blocking note below is kept for the record; the key lifted the limits it describes.

**B.2 — (superseded) BLOCKED on a decision (re-checked 2026-09-17).**

Two findings change this item from "do it" to "decide first":

1. **BACI is less stale than assumed.** `trade_flow.parquet` already runs 1995–**2024**, not 2023. The gain from Comtrade is therefore ~1.5 years, not the 2+ this plan originally claimed.
2. **The keyless preview tier cannot produce global coverage.** `reporterCode=all` returns HTTP 400, omitting `reporterCode` returns 429, and single-reporter queries rate-limit under light sequential use. A global bilateral matrix needs ~200 reporters × N months × 2 HS codes, which that tier will not serve.

So the options are: register a free Comtrade API key for higher limits; restrict scope to the top ~20–30 traders and disclose the coverage gap; or skip it, since BACI to 2024 is reasonable. Building a partially-covered trade layer without that decision would put an undisclosed gap into the most-cited layer, so it is not being done on initiative.

*(original item below)*

**B.2 — UN Comtrade monthly.** Supplements, does not replace, BACI: BACI stays the harmonised annual backbone; Comtrade adds recent months so the trade layer is not two years stale. Must throttle (§1.4) and cache raw responses under `data/raw/comtrade/`. Decide and document how the two series are shown together without implying they are the same measurement — a `sourceGapNote`-style treatment, as already used for BACI year gaps.

**B.3 — EIA.** Register the key (`EIA_API_KEY`). Two candidates: US weekly/monthly production series, and the previously deferred STEO shale-basin time series — the only authoritative open per-basin series found so far, which would give the basins layer real data instead of geometry alone.

**Sequencing:** B.1 first (biggest gain, cleanest licence), then B.2, then B.3. Each is independently shippable; stop after any one if the value is not there.

## 5. Track C — Tell the truth about vintage in the UI

More than half the credibility problem is presentational. Whatever Tracks A and B achieve, the map should not let a visitor assume every layer is equally current.

**C.1 — DONE (`4dcda2f`, Data vintage section in the LayerPanel, generated from the catalog).** Per-layer as-of surfaced in the Legend and LayerPanel, not only in tooltips — read from the bundled catalog, which already carries `as_of`.

**C.2** A visible marker on layers more than N months old, using the same honesty principle as the existing "reserves frozen after 2020" badge.

**C.3** Extend `/methodology` with a recency table generated from `catalog.json` — path, as-of, cadence, and whether the pin is current. No hand-maintained list.

## 6. Risks

- **GEM may have deliberately closed public bulk access.** If the durable URLs turn out to be form-gated only, Track 0 ends at a Wayback pin plus a manual step in `refresh.md`, and GOGET/GOIT freshness becomes a recurring manual chore. Decide then whether that is acceptable or whether GEM stops being the extraction/pipeline source.
- **EI may still not publish reserves past 2020.** Then the reserves layer does not improve and Track C carries the weight.
- **Comtrade and BACI will disagree.** Different harmonisation. Showing both without explaining the difference is worse than showing one.
- **Scope creep into paid data.** `docs/commercial-data-options.md` is the decision record; this plan does not reopen it.

## 7. Done criteria

1. `build_all --ingest` works from clean, and a pin-liveness test guards it.
2. Every `SourcePin` is current or documented as to why not.
3. At least GIE daily data ships as a layer with correct attribution.
4. `catalog.json`, `citations.generated.json`, `LICENSE-DATA.md`, `docs/data-sources.md` and `docs/refresh.md` all updated in the same PR as the data.
5. A visitor can tell, without reading the methodology page, how old each layer is.
