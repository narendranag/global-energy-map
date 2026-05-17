# Data Sources

A research-oriented inventory of the datasets behind Global Energy Map: what's in production, how we use it, what it covers (and doesn't), and what candidate sources we've evaluated for future phases.

This document complements `docs/methodology.md` (the per-phase chronological narrative rendered into `/about`). Use this one when you need to **answer "what data are we using and why,"** not "what did we do in Phase 3."

For runtime metadata (paths, formats, licenses, as-of dates) the canonical source is `public/data/catalog.json`. This document explains *what's in those files* and *what the data lets you say* — context the catalog can't carry.

---

## How to read this document

Each source is a **canonical citation** plus an honest description of coverage, temporal range, units, and the analytical claims the data does and does not support. We err on the side of flagging gaps: the project is meant for researchers who need to know where the model stops being informative.

Categories:

- **In production** — currently ingested and shipped in the live map
- **Evaluated and rejected** — looked at, didn't make the cut, with the reason
- **Candidate (Phase 6+)** — surfaced during research, not yet integrated

---

## In production

### Energy Institute Statistical Review of World Energy

- **URL:** https://www.energyinst.org/statistical-review/resources-and-data-downloads
- **License:** Free; see Energy Institute terms
- **As-of:** 2025-06-26 (2025 edition)
- **Where it lands:** `country_year_series.parquet`
- **Layers/scenarios using it:** reserves choropleth, gas reserves overlay, country-level production tooltips

**What we ingest:**
- Crude oil proved reserves (billion barrels), country-year, 1990–2020
- Gas proved reserves (trillion cubic metres), country-year, 1990–2020
- Crude oil production (kbpd), country-year, 1990–2024

**What it supports:** authoritative country-level reserves and production trends, the de facto canonical reference for international oil/gas comparisons. Used by IEA, OPEC ASB, and academic literature.

**Coverage gaps:**
- **Reserves freeze at 2020** — the EI 2025 edition refreshed production figures through 2024 but did not update reserves tables. Post-2020 years carry the 2020 reserves figure as-is. Apparent post-2020 reserves changes are display artifacts.
- Country aggregation only — no sub-national, no per-field, no per-basin breakdown.
- No price or value data (we only pull volumes).

**Update cadence:** annual, mid-year publication.

---

### Global Energy Monitor — Oil & Gas Extraction Tracker (GOGET)

- **URL:** https://globalenergymonitor.org/projects/global-oil-gas-extraction-tracker/
- **License:** CC BY 4.0 (attribution required: "Data: Global Energy Monitor, CC BY 4.0")
- **As-of:** 2023-07-01 (July 2023 snapshot)
- **Where it lands:** `assets.parquet` rows where `kind = 'extraction_site'`
- **Layers/scenarios using it:** extraction-sites point layer; future Phase 5 vintage-aware filtering

**What we ingest:** ~5,000 oil and gas fields globally. Per-asset: location (lon/lat), name, country, operator, status, commissioned year, source URL.

**Coverage gaps:**
- **Capacity field is null across the entire snapshot.** GEM does publish capacity in a separate sheet with non-uniform units — left for a future ingest pass.
- **Commissioned year populated only on 22%** (median 2002). The rest are undated. For time-aware filtering this means 78% of sites appear in all years.
- **Decommissioned year populated on 0%** — sites currently in GEM are presumed operating.
- Snapshot is from July 2023; newer GEM releases require gated email-form access.

**Update cadence:** GEM publishes irregular updates; we pin a specific release for reproducibility.

---

### Global Energy Monitor — Global Oil Infrastructure Tracker (GOIT)

- **URL:** https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/
- **License:** CC BY 4.0
- **As-of:** 2025-04-09 release
- **Where it lands:** `pipelines.parquet` (crude + NGL rows) + `pipelines.geojson` sidecar for the map layer
- **Layers/scenarios using it:** oil pipelines layer (operating + in-construction); refinery feedstock attribution math

**What we ingest:** 3,957 features (after filtering for valid geometries and operating/in-construction status). Per-pipeline: LineString geometry, name, status, commodity, capacity (kbpd), operator, parent operator, start year, end year, fuel type.

**Why GeoJSON not XLSX:** The GOIT XLSX export is behind a Supabase token-exchange form; GEM publishes the same data as a public GeoJSON on DigitalOcean CDN. The GeoJSON has 26 properties — all analytical content of the XLSX. The XLSX's extra columns are scaled/searchable variants of the same fields.

**Coverage:**
- **start_year populated on 71%** (range 1904–2031, median 2010). Strong enough to support time-aware year-filtering.
- ~24% of raw features lack geometry — filtered out at ingest.

**Update cadence:** GEM publishes new GOIT snapshots periodically; we pin a release.

---

### Global Energy Monitor — Global Gas Infrastructure Tracker (GGIT)

- **URL:** https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/
- **License:** CC BY 4.0
- **As-of:** 2026-02-20 release
- **Where it lands:** `pipelines.parquet` (gas rows) + `pipelines.geojson` (gas features); `assets.parquet` rows where `kind ∈ {lng_export, lng_import}`
- **Layers/scenarios using it:** gas pipelines layer; LNG terminal layer; Hormuz-LNG scenario import-side attribution

**What we ingest:**
- Gas pipelines: LineString geometry, status, capacity (bcm/y), operator, start year, fuel type.
- LNG terminals: 434 facilities split by `tracker-custom ∈ {GGIT-export, GGIT-import}`. Capacity in mtpa (million tonnes per annum).

**Coverage:**
- LNG terminals have authoritative import/export classification and rich mtpa capacity data — the gold standard for global LNG infrastructure.
- Gas pipeline geometry is comparable in quality to oil pipelines.

---

### NETL Global Oil & Gas Infrastructure (GOGI)

- **URL:** https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44
- **License:** US Government work, public domain (17 USC §105)
- **As-of:** 2026-05-17
- **Where it lands:** `basins.parquet` + `basins.geojson` sidecar (basins); `assets.parquet` rows where `kind ∈ {storage, port}`
- **Layers/scenarios using it:** basin polygons layer; storage hubs point layer; ports point layer

**What we ingest:**
- **Basins:** 1,046 petroleum-bearing geological basin polygons with area, country, region.
- **Storage:** 26,102 storage facilities (oil + gas) with capacity in barrels.
- **Ports:** 3,694 oil & gas handling ports.

**Why NETL:** the strongest single global open dataset for upstream/midstream infrastructure that isn't behind a paywall or gated form. US Government source, public domain, queryable via ArcGIS REST FeatureServer. Comprehensive across 14+ asset types beyond what we currently ingest.

**Other NETL layers not yet ingested:** Refineries (2,272 — Phase 5 candidate), LNG (329), Wells (4.8M — needs zoom-aware clustering), Power Plants, Processing Plants, Stations, Railways, Platforms/Pads, Fields, Coal Mines.

**Coverage gaps:**
- Field names truncated to ~10 characters (legacy shapefile import). The schema uses metadata-database conventions (`MD_`-prefixed fields).
- Many records have blank or whitespace-only string fields where data is missing — not nullable types.

---

### OpenStreetMap — Refineries

- **URL:** https://www.openstreetmap.org/
- **License:** ODbL (Open Database License) — derivative works permitted with attribution and share-alike
- **As-of:** 2026-05-15
- **Where it lands:** `assets.parquet` rows where `kind = 'refinery'`
- **Layers/scenarios using it:** refineries point layer; refinery feedstock attribution math

**What we ingest:** 168 refineries via Overpass API query for `industrial=oil_refinery`, `industrial=oil`, `man_made=works + product=oil`. Per-refinery: name, country, operator, commissioned year, source URL.

**Coverage gaps:**
- **OSM refinery coverage is geographically skewed** — overrepresented in OECD countries, underrepresented in China, India, Saudi Arabia, South Korea. The 168 features represent an estimated 30–40% of global refining capacity by count.
- **Zero refineries have capacity data.** The refinery feedstock attribution falls back to uniform-within-country logic (each refinery = 1/N of country's import mix) for all 168.
- OSM tagging quality varies by country and contributor activity.

**Why we keep OSM despite NETL having 2,272 refineries:** OSM's curated naming quality is high for major OECD refineries (e.g., "MiRO Mineralölraffinerie Oberrhein," "Fawley Oil Refinery"). NETL's facility_n is blank for 25% of records and often blank precisely for the most analytically important refineries. Phase 5 plans augment OSM with NETL records that don't proximity-match OSM (2 km threshold, same country).

---

### BACI bilateral trade (CEPII)

- **URL:** https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37
- **License:** Free for academic/research use; see CEPII terms
- **As-of:** 2026-01 release (HS92 1995–2024 series)
- **Where it lands:** `trade_flow.parquet`
- **Layers/scenarios using it:** all scenarios — crude routing (HS 2709) and LNG routing (HS 271111)

**What we ingest:** Bilateral annual trade flows for two HS codes:
- **HS 2709** (crude petroleum oils) for oil scenarios — Hormuz, Druzhba, BTC, CPC
- **HS 271111** (liquefied natural gas) for the Hormuz-LNG scenario

Each row: year, exporter ISO3, importer ISO3, quantity (tonnes).

**Why BACI not UN Comtrade directly:** BACI is the pre-processed, deduplicated, mirror-reconciled version of Comtrade. It resolves the mirror-statistics problem (exporter and importer report different values) using a published reconciliation methodology. No API key required.

**Why HS 271111 not HS 2711 for LNG:** Aggregating to HS 2711 mixes liquefied (HS 271111) and pipeline (HS 271121) gas. The Strait of Hormuz only constrains waterborne gas; pipeline gas doesn't transit chokepoints. Aggregating overstates Hormuz's reach.

**Coverage gaps:**
- **BACI suppresses low-value and sensitive flows.** Iran (IRN) crude exports in 2023–2024 show only one bilateral pair with near-zero value, materially understating Iran's historical bilateral dependencies in South and East Asia.
- Annual granularity only — no monthly or quarterly detail.
- Lags by ~1 year from current date.

---

### EIA World Oil Transit Chokepoints (+ IEA pipeline analysis)

- **URL:** https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints
- **License:** Public domain (US government)
- **As-of:** 2026-05-15 (consolidated EIA + IEA references)
- **Where it lands:** `chokepoint_route.parquet`, `disruption_route.parquet`
- **Layers/scenarios using it:** all four scenarios (Hormuz, Druzhba, BTC, CPC)

**What we ingest:** static routing-share tables that encode how each exporter's crude or LNG flows through each chokepoint or pipeline. Example: Saudi Arabia's crude is 88% Hormuz-dependent, 12% bypasses via East-West pipeline. Druzhba routing shares: DEU 60% of Russian crude, POL 95%, BLR/SVK/HUN 100%, CZE 90%.

**Coverage gaps:**
- **Routing shares are fixed across all years** — they don't track maintenance windows, sanctions regimes, or renegotiations of joint-venture operating agreements.
- Compiled from EIA and IEA analyst commentary, not raw export-flow data. A per-year refinement using disaggregated EIA export flow data is a Phase 6+ candidate.

---

### Natural Earth — country boundaries

- **URL:** https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/
- **License:** Public domain
- **As-of:** 2024-10-01
- **Where it lands:** `countries.geojson`
- **Layers/scenarios using it:** basemap; reserves choropleth fills

**What we ingest:** 1:110m admin-0 country polygons. Used as fill geometry for choropleths and as the spatial reference for country aggregation.

---

## Evaluated and rejected

### NETL LNG (`Hosted/LNG` FeatureServer)

- **Why considered:** Direct counterpart to NETL basins/storage/ports; would supplement GEM LNG.
- **Why rejected:** 329 terminals, but **only 1.2% have capacity** (4 / 329) and the `type` field does not encode import vs export. Without an import/export discriminant and without capacity, the records can't be merged with GEM's typed mtpa-rich data.

### GOIT XLSX export

- **Why considered:** Resume context flagged "richer 51-column schema vs current GeoJSON 25 properties."
- **Why rejected:** Inspection of the GeoJSON shows 26 properties including owner, parent, start-year, capacity, fuel, status. The XLSX's extra columns are scaled/searchable variants of the same fields, not new analytical content. The XLSX is also gated behind a Supabase token-exchange form; the GeoJSON is publicly available on DigitalOcean CDN.

### Vercel Blob migration for pipelines.geojson

- **Why considered:** Raw `pipelines.geojson` is 73 MB, well over GitHub's 50 MB soft limit and CLAUDE.md's 25 MB single-file ceiling.
- **Why rejected:** Geometry simplification at `tolerance=0.005` (~500 m) cuts the sidecar to 13 MB — a 5.2× reduction with no visible degradation at world or continent zoom. Blob migration is deferred until a future file genuinely exceeds the ceiling.

---

## Candidate sources (Phase 6+)

Surfaced via Tavily/Exa research. Listed roughly in order of analytical value × tractability.

### EIA STEO — tight oil and shale gas by US region/formation

- **URL:** https://www.eia.gov/petroleum/drilling/ (data now published in STEO data tables since June 2024)
- **API:** EIA API v2 (`api.eia.gov/v2/steo/...`), requires free API key registration
- **License:** Public (US government)
- **What it offers:** Monthly tight oil and shale gas production for eight US shale regions — Anadarko, Appalachia, Bakken, Eagle Ford, Haynesville, Niobrara, Permian, Utica. As of the March 2026 STEO, Permian is further broken down by formation (Avalon, Barnett, Bone Spring, Dean, Spraberry, Wolfcamp, Woodford).
- **Why it matters:** This is the **only authoritative open per-basin time-series production dataset we've found.** It enables time-varying basin production for the world's #1 producer region, replacing the current country-aggregated production view with structural detail. Globally, no equivalent open dataset exists.
- **Cost:** New ingest script (EIA API v2 client), region/formation → NETL basin_id mapping (~8 entries), new `basin_year_production.parquet` schema. Asymmetric coverage (US-only) requires honest documentation.

### EIA Refinery Capacity Report

- **URL:** https://www.eia.gov/petroleum/refinerycapacity/
- **License:** Public (US government)
- **What it offers:** US refinery capacities annually, per-facility, authoritative. Distillation capacity, downgrading capacity, ownership, location, status.
- **Why it matters:** NETL Refineries has capacity populated for only 16% of records and the strings are messy. EIA Refinery Capacity Report is the canonical US source — combining it with NETL (global coverage) and OSM (curated names) gives a three-source merge that's much stronger than any single source.

### Canada CER Pipeline Throughput

- **URL:** https://open.canada.ca/data/en/dataset/dc343c43-a592-4a27-8ee7-c77df56afb34
- **License:** Open Government Licence — Canada
- **What it offers:** Quarterly actual throughput AND capacity for CER-regulated Canadian oil and liquids pipelines since 2016. Reports cover most Canadian crude exports (Enbridge mainline, Trans Mountain, Keystone, Express, etc.).
- **Why it matters:** Our pipeline layer currently shows capacity only. CER data would be the first **actual flow** data in the model, enabling utilization metrics and trend analysis for major North American crude infrastructure.

### USGS World Petroleum Assessment polygons

- **URL:** https://energy.usgs.gov/world-energy/
- **License:** Public domain (US government)
- **What it offers:** Province and Assessment Unit boundary polygons globally, with undiscovered-resource estimates per AU. Finer-grained than NETL basins for many regions and includes assessment-based reserves estimates.
- **Why it matters:** Could supplement NETL basins with USGS resource-assessment context (where it lacks production data). Useful as a "what might still be there" overlay vs the "what's currently produced from where" frame of NETL+EIA STEO.

### GIIGNL Annual Report (PDF tables)

- **URL:** https://www.giignl.org/annual-report
- **License:** Public PDF; tables would need extraction
- **What it offers:** Authoritative LNG terminal capacity AND import volumes by terminal, per year. GIIGNL is the international LNG importers' association — their annual report is the canonical LNG market reference.
- **Why it matters:** The single richest source for LNG terminal-level data. Bonus: per-terminal annual throughput would be the first **actual flow** data for LNG infrastructure.
- **Cost:** PDF parsing; tables are well-structured but require manual scraping logic. Major Phase 6+ investment.

### KAPSARC Designed Refinery Capacity

- **URL:** https://datasource.kapsarc.org/explore/assets/designed-capacity-of-oil-refineries/
- **License:** KAPSARC open data terms (generally permissive for research)
- **What it offers:** Designed refining capacity by facility, global coverage. Saudi-government-funded research portal with substantial open-data offerings.
- **Why it matters:** Free alternative to the paywalled OGJ Worldwide Refining Capacity Survey. Could plug into the refinery triple-merge alongside EIA + NETL.

### IEA Monthly Oil Data Service (MODS) — Trade

- **URL:** https://www.iea.org/data-and-statistics/data-product/monthly-oil-data-service-mods-trade
- **License:** Paid; free for OECD member-country academic users in some cases
- **What it offers:** Monthly bilateral oil trade flows for OECD member countries. Much higher frequency than BACI's annual.
- **Why it matters:** Annual BACI flows can't capture sudden disruptions (sanctions, chokepoint closures within a year). Monthly data would enable within-year scenario realism. Coverage limited to OECD, but most importing economies are in scope.

### Alyeska TAPS and other per-pipeline operator pages

- **URL:** https://alyeska-pipe.com/historic-throughput/ (representative example)
- **License:** Public on operator websites
- **What it offers:** Per-pipeline historical actual throughput for individual major pipelines (Trans-Alaska, etc.). Granular operator-published data.
- **Why it matters:** Spot-check ground truth against modeled flows. Low priority unless we want per-pipeline analytical depth.

### UK NSTA Field Production Points

- **URL:** Search data.gov.uk for "NSTA Field Production"
- **License:** Open Government Licence — UK
- **What it offers:** UK continental shelf field-level production, recent and historic.
- **Why it matters:** Country-specific but high-quality per-field production data. Could anchor a future per-field production layer for UK fields. Similar government datasets likely exist for Norway, Brazil, Australia — worth a separate sweep.

### GEM Global Coal Plant + Mine Trackers

- **URL:** https://globalenergymonitor.org/projects/
- **License:** CC BY 4.0
- **What it offers:** Global coal mines and coal-fired power plants, CC BY 4.0, GEM tracker quality.
- **Why it matters:** Coal is the missing fossil fuel in the project's current commodity axis. Phase 5+ candidate for the coal-sector + cross-commodity scenarios slice.

### GEM Global Oil & Gas Plant Tracker (GOGPT) vs NETL Power Plants

- **URL:** https://globalenergymonitor.org/projects/global-oil-gas-plant-tracker/ + NETL `Power_Plants` FeatureServer
- **License:** GEM = CC BY 4.0; NETL = public domain
- **What it offers:** Two complementary global power-plant datasets. GEM tracks ~14,700 fossil-fuel power units; NETL has its own counterpart.
- **Why it matters:** Adds the demand-side (electricity generation) layer over existing fuel supply chains. Phase 5+ candidate; needs a comparison + primary-source pick.

### Tanker / LNG carrier AIS

- **Sources considered:** TankerMap (live snapshot, free), MarineTraffic (free tier limited, paid historical), commercial AIS providers.
- **Why it matters:** Real-time and historic vessel positions complete the trade-flow picture between exporters and importers. Most visually striking deferred slice; wildcard is sourcing.
- **Status:** Deserves its own dedicated brainstorm + phase. AIS source choice is the gating decision.

---

## How to add a new source

1. **Ingest script** at `scripts/ingest/<source>.py` downloads to `data/raw/<source>/` (gitignored). Idempotent: re-running uses cached files unless `--force`.
2. **Transform script** at `scripts/transform/build_<output>.py` joins, harmonizes, and emits Parquet (or GeoParquet) to `public/data/`.
3. **Catalog entry** in `public/data/catalog.json` — bump `version`, add an `entries[]` row with `source_url`, `license`, `as_of`, `layers`. The `/about` page reads this at build time.
4. **Allow-list bump** in `src/lib/data-catalog/index.ts` — extend the version validator.
5. **Methodology entry** in `docs/methodology.md` for the current phase narrative.
6. **This document** — add to the relevant section above (In production / Evaluated / Candidate) so future researchers have the context.

### Conventions

- Names: source-specific `NAME → ISO3` dicts live in `scripts/common/iso3.py` (`EI_NAME_TO_ISO3`, `GEM_NAME_TO_ISO3`, `NETL_NAME_TO_ISO3`). Add a new dict per source rather than mutating existing ones.
- Idempotency: every ingest writes to a versioned path (`data/raw/<source>/<release>/...`); every transform drops prior rows of the same kind before appending.
- Provenance: when a transform merges multiple sources, add a `source` column on the output rows so downstream consumers can filter.
- Attribution: CC BY 4.0 sources require "Data: Global Energy Monitor, CC BY 4.0" (or equivalent) on the methodology page and any per-layer metadata UI.

### What NOT to do

- Don't hit data-provider APIs from the browser. All ingestion is build-time only.
- Don't commit raw downloads to git — `data/raw/` is gitignored. Processed Parquet files in `public/data/` are committed.
- Don't add a runtime config layer that reads paths from `catalog.json`. The catalog is metadata; runtime SQL hardcodes `read_parquet('/data/<file>.parquet')` by design.
