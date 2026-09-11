# Data Sources

A research-oriented inventory of the datasets behind Global Energy Map: what's in production, how we use it, what it covers (and doesn't), and what candidate sources we've evaluated for future phases.

This document complements `docs/methodology.md` (the current-state methodology rendered at `/methodology`: per layer and per scenario, what the data covers and how the scenarios use it) and `docs/history.md` (the phase-by-phase record). Use this one when you need to **answer "what data are we using, why, and what else did we consider."**

For runtime metadata (paths, formats, licenses, as-of dates, rows, sha256, and whether a file may be downloaded) the canonical source is `public/data/catalog.json`, rendered at `/data`. This document explains *what's in those files* and *what the data lets you say* — context the catalog can't carry.

**Download policy (Phase 9 decision, Phase 10 open extract).** Downloads are limited to CC BY 4.0 and public-domain sources plus the project's own route-share table. Each catalog entry carries `redistributable` (its licence permits redistribution under that policy) and a computed `downloadable` (every source sharing the file is redistributable). Energy Institute (permission needed for extensive reproduction) is view-only; BACI is downloadable under the Etalab Open Licence 2.0 (Phase 10); `assets.parquet` is not offered as-is because it mixes 88 ODbL OpenStreetMap refinery rows with CC BY and public-domain rows. **`assets_open.parquet`** — the same table minus the OSM rows, written by `scripts/transform/build_assets_open.py` — is the downloadable asset table; single layers can also be exported from the map's Share / cite menu.

**Licences in plain language:** [`LICENSE-DATA.md`](../LICENSE-DATA.md) (per source: licence, what we redistribute and where, attribution line, restrictions; not legal advice). **Pins and refresh:** every source's URL, release and as-of date is pinned in `scripts/common/sources.py`; cadence and the refresh procedure are in [`docs/refresh.md`](refresh.md).

---

## How to read this document

Each source is a **canonical citation** plus an honest description of coverage, temporal range, units, and the analytical claims the data does and does not support. We err on the side of flagging gaps: the project is meant for researchers who need to know where the model stops being informative.

Categories:

- **In production** — currently ingested and shipped in the live map
- **Evaluated and rejected** — looked at, didn't make the cut, with the reason
- **Candidate (Phase 7+)** — surfaced during research, not yet integrated

---

## In production

### Energy Institute Statistical Review of World Energy

- **URL:** https://www.energyinst.org/statistical-review/resources-and-data-downloads
- **License:** free to quote with attribution; the EI asks for permission before extensive reproduction of its tables, and S&P Global-sourced data may not be redistributed ([About page](https://www.energyinst.org/statistical-review/about)). Shown in the app, not offered for download.
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
- **Layers/scenarios using it:** extraction-sites point layer (vintage-aware since Phase 5)

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
- **Where it lands:** `pipelines.geojson` sidecar for the map layer (full-resolution GeoParquet in `data/derived/`, build-time only)
- **Layers/scenarios using it:** oil pipelines layer (operating + in-construction). Not an input to the scenario engine (pipeline scenarios are defined by route shares).

**What we ingest:** 1,185 crude / NGL / crude+NGL features (after filtering for valid geometries and operating/in-construction status; 3,957 together with the GGIT gas lines). Per-pipeline: LineString geometry, name, status, commodity, capacity (kbpd, known for 933), operator, start/end country, start year.

**Why GeoJSON not XLSX:** The GOIT XLSX export is behind a Supabase token-exchange form; GEM publishes the same data as a public GeoJSON on DigitalOcean CDN. The GeoJSON has 26 properties — all analytical content of the XLSX. The XLSX's extra columns are scaled/searchable variants of the same fields.

**Coverage:**
- **start_year populated on 64% of oil lines** (760 / 1,185; 71% across oil + gas). Strong enough to support time-aware year-filtering.
- ~24% of raw features lack geometry — filtered out at ingest.

**Update cadence:** GEM publishes new GOIT snapshots periodically; we pin a release.

---

### Global Energy Monitor — Global Gas Infrastructure Tracker (GGIT)

- **URL:** https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/
- **License:** CC BY 4.0
- **As-of:** 2026-02-20 release
- **Where it lands:** `pipelines.geojson` (gas features); `assets.parquet` rows where `kind ∈ {lng_export, lng_import}`
- **Layers/scenarios using it:** gas pipelines layer; LNG terminal layer; Hormuz-LNG scenario import-side attribution

**What we ingest:**
- Gas pipelines: LineString geometry, status, capacity (bcm/y), operator, start year, fuel type.
- LNG terminals: as of Phase 3, 434 facilities split by `tracker-custom ∈ {GGIT-export, GGIT-import}` (capacity in mtpa). **As of Phase 6, GEM is a supplement (7 terminals) to LNG-T3** (see the LNG-T3 entry below) — GEM terminals sharing a name with a same-country LNG-T3 terminal, or falling within 25 km of one, are dropped as already-covered.

**Coverage:**
- LNG terminals have authoritative import/export classification and rich mtpa capacity data — useful as a supplement where LNG-T3 doesn't have a match.
- Gas pipeline geometry is comparable in quality to oil pipelines.

---

### LNG-T3 — Zhou et al. 2026 (Global Marine LNG Terminals, Tankers & Trade)

- **URL:** https://doi.org/10.5281/zenodo.19571058
- **License:** **CC BY 4.0** (attribution required: "Data: Zhou et al. 2026, LNG-T3, CC BY 4.0 (Zenodo 10.5281/zenodo.19571058)")
- **As-of:** 2026-04-01 (Zenodo record 19571058, our label `v1-2026-04-01`; Zenodo lists it as the second version under concept DOI 10.5281/zenodo.17273526 — the local CSVs match the record's md5 checksums, pinned in `scripts/common/sources.py`)
- **Where it lands:** `assets.parquet` rows where `source LIKE 'Zhou%LNG-T3%'` (LNG terminals, primary source as of Phase 6); `lng_voyage.parquet`, `lng_trade_daily.parquet`, `lng_terminal_daily.parquet`
- **Layers/scenarios using it:** LNG terminals layer (primary); LNG voyages opt-in layer; Hormuz-LNG scenario (per-terminal disaggregation for years 2020–2024)

**What we ingest:**
- LNG terminals: 545 total in `LNG_terminal.csv` (471 unique names), filtered to `operating`/`construction` (330), then collapsed to **305** by resolving 25 terminal names that carried both an operating and a construction record (operating kept, higher capacity on ties).
- LNG voyages: **17,592** AIS-derived voyages, 2020-01-01 → 2024-12-31, with from/to terminal, from/to country, `amount_cbm`, `confidence_score` (1–5).
- Country-pair daily trade: **16,691** arrival/departure records.
- Terminal-daily measured throughput: **16,115** records, covering **159 of the 471 unique terminal names** in `LNG_terminal.csv` with non-zero measured flow.
- The 406-active/861-total-vessel fleet inventory (`LNG_tanker.csv`) is ingested but NOT surfaced as a map layer in Phase 6 — deferred to Phase 7+.

**Why LNG-T3 as terminal primary, not just a voyage supplement:** LNG-T3's terminal table carries `commissioned_year` (from `start_year`, populated 97.8% of LNG rows) and `total_processed_bcm`/`unit_count`/`UN_LOCODE`, none of which GEM's terminal table has at comparable coverage — a strict upgrade for the terminal point layer even setting aside the voyage data.

**Validation — partial AIS coverage, NOT used as a country-total source:** `scripts/validate/lng_t3_vs_giignl.py` sums LNG-T3 daily arrivals to annual tonnage (cbm × 0.4245 t/cbm) and compares against GIIGNL Annual Report public headline totals. Result (`data/validation/lng_t3_vs_giignl.txt`, reproduced in `docs/methodology.md`, LNG voyages section):

| Year | LNG-T3 Mt | GIIGNL Mt | Coverage ratio |
|---|---|---|---|
| 2020 | 76.6 | 356.1 | 0.22 |
| 2021 | 105.0 | 372.3 | 0.28 |
| 2022 | 136.0 | 401.5 | 0.34 |
| 2023 | 164.8 | 401.4 | 0.41 |
| 2024 | 129.4 | 407.0 | 0.32 |

LNG-T3 covers **22–41% of GIIGNL's global LNG trade, 2020–2024** — every year exceeds the validation script's 30% acceptable-gap threshold. **LNG-T3 is a partial-coverage AIS sample, not a comprehensive trade census; the scenario engine and this project never use it as a country-total LNG source.** BACI HS 271111 remains the canonical country-level total for all years, including 2020–2024. LNG-T3 voyages are used only to redistribute a BACI country total across its covered terminals and to derive each terminal's exporter mix.

**Coverage gaps:**
- Confidence score (1–5) reflects AIS voyage-detection certainty; Phase 6's voyage layer and scenario engine default to `confidence_score >= 3`.
- The 2020-01-01 start cuts off pre-pandemic history; pre-2020 LNG analysis always falls back to BACI HS 271111 with capacity-weighted attribution.
- Density conversion (`cbm × 0.4245` for tonnes) is the DOE convention but real density varies ~0.41–0.46 depending on LNG composition — used for display only, never for the tonnes-conservation math in the scenario engine.

---

### NETL Global Oil & Gas Infrastructure (GOGI)

- **URL:** https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44
- **License:** US Government work, public domain (17 USC §105). NETL's EDX listing of the GOGI collection names a Creative Commons Attribution licence, and GOGI compiles hundreds of third-party open datasets, so we credit NETL on every NETL row ("Data: NETL Global Oil & Gas Infrastructure (GOGI), US DOE"). Cite Sabbatino et al., doi:10.18141/1502839.
- **As-of:** 2026-05-17
- **Where it lands:** `basins.geojson` sidecar (basins; full-resolution GeoParquet in `data/derived/`); `assets.parquet` rows where `kind ∈ {storage, port}`
- **Layers/scenarios using it:** basin polygons layer; storage hubs point layer; ports point layer

**What we ingest:**
- **Basins:** 1,046 petroleum-bearing geological basin polygons with area, country, region.
- **Storage:** 26,102 storage facilities (oil + gas). The schema has a capacity field in barrels, but it is populated on only 4 rows.
- **Ports:** 3,694 oil & gas handling ports.

**Why NETL:** the strongest single global open dataset for upstream/midstream infrastructure that isn't behind a paywall or gated form. US Government source, public domain, queryable via ArcGIS REST FeatureServer. Comprehensive across 14+ asset types beyond what we currently ingest.

**Other NETL layers not yet ingested:** Refineries (2,272 — Phase 5 candidate), LNG (329), Wells (4.8M — needs zoom-aware clustering), Power Plants, Processing Plants, Stations, Railways, Platforms/Pads, Fields, Coal Mines.

**Coverage gaps:**
- Field names truncated to ~10 characters (legacy shapefile import). The schema uses metadata-database conventions (`MD_`-prefixed fields).
- Many records have blank or whitespace-only string fields where data is missing — not nullable types.

---

### NETL GOGI Refineries _(primary refinery source as of Phase 5)_

- **URL:** https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/Refineries/FeatureServer
- **License:** US Government work, public domain (17 USC §105)
- **As-of:** 2026-05-17
- **Where it lands:** `assets.parquet` rows where `kind = 'refinery'` and `source = 'National Energy Technology Laboratory (US DOE) — GOGI Refineries'`
- **Layers/scenarios using it:** refineries point layer; refinery feedstock attribution math

**What we ingest:** All 2,272 refinery point features. NETL lists many plants more than once (English name, numbered "333 - …" and French "Raffinerie de …" variants within ~100 m); since Phase 8 these are merged within source (same country, ≤ 1 km, never merging two rows whose known capacities differ by > 5 %), leaving 1,075 NETL rows. A few probable duplicates with conflicting capacities (e.g. Pemex Tula/Salamanca/Madero/Cadereyta, Irving) remain as two rows. Per-refinery: location, country (via `NETL_NAME_TO_ISO3`), facility name (75% populated), operator (80% populated), capacity (15% populated — parsed from string field via `scripts/transform/_refinery_capacity.py`), status (14% populated; nulls default to `"operating"` since the source layer's purpose is current infrastructure).

**Coverage:**
- 13× more refineries than the prior OSM-only source.
- Strong coverage of major refining hubs that OSM under-tagged: China (192), USA (166), Russia (119), Canada (117), Japan (105) lead the count.
- Capacity coverage rises from 0% (OSM-only) to ~15% (NETL's populated subset). Records without parseable capacity fall back to uniform-within-country attribution in the scenario engine.

**Coverage gaps:**
- Field names truncated to ~10 chars (legacy shapefile import); fields use metadata-database conventions (`md_country`, `md_source`, `facility_n`).
- `facility_n` is often blank precisely for the most analytically important refineries (US/Russia/Saudi/China majors) — the label-fallback chain is `facility_n || operator || "Refinery"`.
- `decommissioned_year` is 0% populated; assume all listed refineries are operating.

---

### OpenStreetMap — Refineries _(supplement to NETL as of Phase 5)_

- **URL:** https://www.openstreetmap.org/
- **License:** ODbL (Open Database License) — derivative works permitted with attribution and share-alike
- **As-of:** 2026-05-15 (Overpass snapshot)
- **Where it lands:** `assets.parquet` rows where `kind = 'refinery'` and `source = 'OpenStreetMap (Overpass)'` — the only rows excluded from the downloadable `assets_open.parquet`
- **Layers/scenarios using it:** refineries point layer; refinery feedstock attribution math

**What we ingest:** Refinery features via Overpass API query for `industrial=oil_refinery`, `industrial=oil`, and `man_made=works + product=oil` (with multilingual name keyword filtering for the looser tags). Raw set: 168 refineries. After Phase 5's 2 km same-country dedup against NETL, **88 OSM-only refineries** remain in production as supplements; the other 80 collapse into matching NETL records.

**Why we keep OSM as a supplement:** OSM's curated facility names are high-quality for major OECD refineries (e.g., "MiRO Mineralölraffinerie Oberrhein," "Fawley Oil Refinery") where NETL's `facility_n` is sometimes blank. The 2 km dedup keeps OSM only where it complements rather than duplicates.

**Coverage gaps:**
- Zero capacity coverage in source — OSM contributors rarely tag refinery capacity. OSM-supplement records fall back to uniform-within-country attribution.
- Geographic skew toward OECD; little contribution beyond what NETL already provides.

---

### BACI bilateral trade (CEPII)

- **URL:** https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37
- **License:** Etalab Open Licence 2.0 (checked 2026-09-10 — reuse and redistribution with attribution; earlier project docs said "academic/research use"). Cite Gaulier & Zignago (2010), CEPII Working Paper 2010-23. By project policy `trade_flow.parquet` stays view-only; revisiting that is a user decision.
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
- **Some BACI quantities are implausible.** Some BACI **quantities** are wrong by one to three orders of magnitude while the values are fine (e.g. Philippines ← Saudi Arabia crude 2023: 80.9 Mt at 26 USD/t against a ~650 USD/t median; Taiwan ← Saudi Arabia 2014: 14 kt for USD 10.5 bn). Because the scenarios work in tonnes, `build_trade_flow.py` re-estimates any row whose unit value lies outside 5× of the (HS code, year) median as `value_usd / median`, keeping BACI's figure in `qty_reported` and flagging `qty_imputed` (9,655 of 53,727 rows, mostly tiny shipments; net −258 Mt crude and −520 Mt LNG across 1995–2024). Values are never changed.
- **BACI suppresses low-value and sensitive flows.** Iran (IRN) crude exports in 2023–2024 show only one bilateral pair with near-zero value, materially understating Iran's historical bilateral dependencies in South and East Asia.
- Annual granularity only — no monthly or quarterly detail.
- Lags by ~1 year from current date.

---

### EIA World Oil Transit Chokepoints (+ IEA pipeline analysis)

- **URL:** https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints
- **License:** Public domain (US government)
- **As-of:** 2026-05-15 (consolidated EIA + IEA references)
- **Where it lands:** `disruption_route.parquet` (each row carries `source_title`, `source_url`, `source_year`)
- **Layers/scenarios using it:** all four scenarios (Hormuz, Druzhba, BTC, CPC)

**What we ingest:** static routing-share tables that encode how each exporter's crude or LNG flows through each chokepoint or pipeline. Example: Saudi Arabia's crude is 88% Hormuz-dependent, 12% bypasses via East-West pipeline. Druzhba routing shares: DEU and POL 47% of Russian crude (IEA northern-branch volume allocated pro-rata), BLR/SVK/HUN/CZE 100%. Each row in `disruption_route.parquet` carries its citation and derivation (`source_title`, `source_url`, `source_year`, `source_note`); six shares were revised to source-derived values on 2026-09-10.

**Coverage gaps:**
- **Routing shares are fixed across all years** — they don't track maintenance windows, sanctions regimes, or renegotiations of joint-venture operating agreements.
- Compiled from EIA and IEA analyst commentary, not raw export-flow data. A per-year refinement using disaggregated EIA export flow data is a Phase 7+ candidate.

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
- **Why rejected:** Geometry simplification at `tolerance=0.005` (~500 m) cut the sidecar to 13 MB — a 5.2× reduction with no visible degradation at world or continent zoom. Merging each feature's contiguous line fragments before simplifying (Phase 10) takes it to ~8 MB. Blob migration is deferred until a future file genuinely exceeds the ceiling.

---

## Candidate sources (Phase 7+)

### Phase 8 — consolidation (formerly "Phase 7")

Phase 7 became a correctness pass (EI year parsing, BACI aggregates, reproducible assets, generated catalog). Engineering cleanup still precedes new data sources: a shared asset query cache so the five layer hooks stop scanning `assets.parquet` separately; an app state store that syncs to the URL; explicit ready signals for e2e; a vintage filter on scenario inputs; Legend driven by `LayerState`; a daily-throughput tooltip; and dropping the unused `pipelines.parquet` from the runtime bundle.

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
- **Cost:** PDF parsing; tables are well-structured but require manual scraping logic. Major Phase 7+ investment.

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
- **Why it matters:** Coal is the missing fossil fuel in the project's current commodity axis. Phase 7+ candidate for the coal-sector + cross-commodity scenarios slice.

### GEM Global Oil & Gas Plant Tracker (GOGPT) vs NETL Power Plants

- **URL:** https://globalenergymonitor.org/projects/global-oil-gas-plant-tracker/ + NETL `Power_Plants` FeatureServer
- **License:** GEM = CC BY 4.0; NETL = public domain
- **What it offers:** Two complementary global power-plant datasets. GEM tracks ~14,700 fossil-fuel power units; NETL has its own counterpart.
- **Why it matters:** Adds the demand-side (electricity generation) layer over existing fuel supply chains. Phase 7+ candidate; needs a comparison + primary-source pick.

### Tanker / LNG carrier AIS

**Detailed research memo:** `docs/research/2026-05-19-tanker-ais-sources.md` (six-query pass with concrete dataset recommendations).

Key findings from the 2026-05-19 sweep:

- **LNG carriers — shipped in Phase 6.** LNG-T3 (Zhou et al. 2026) — see the "In production" section above for the full schema, counts, and the GIIGNL partial-coverage finding (22–41%, so it supplements rather than replaces BACI). The 861-vessel fleet inventory was *not* surfaced as a map layer in Phase 6; an animated vessel-position layer remains a Phase 7+ candidate.
- **US-coastal oil tankers — solved openly.** MarineCadastre.gov (NOAA / US Coast Guard NAIS) publishes 2009–2024 raw AIS positions for US coastal/EEZ waters as CSV/GeoPackage. ShipType codes 80–89 for tankers. Public domain.
- **EU-coastal tanker route density — open.** EMODnet Human Activities derived from EMSA SafeSeaNet (likely CC BY); GeoTIFF / WMS aggregates.
- **Global open AIS with caveats.** Global Fishing Watch (1 position/vessel/hour, non-commercial license) and AISStream.io (real-time WebSocket, no SLA / beta / no clear commercial terms) — usable but constrained.
- **Global commercial AIS.** Datalastic (€199–849/mo) is the strongest self-serve REST option if the project ever takes a paid-data budget. Vortexa/Kpler/TankerTrackers/MarineTraffic are enterprise-priced.

**Recommended Phase 6 scope:** ingest LNG-T3 to replace the current GEM-only LNG terminal layer; add LNG vessel fleet + voyage layers; switch the Hormuz-LNG scenario from annual BACI × capacity-weighted attribution to measured daily flows. US-coastal oil tankers via MarineCadastre is a clean follow-up; global oil tanker positions remain a paid-data decision and stay deferred.

---

## How to add a new source

1. **Pin + ingest script.** Add a `SourcePin` (URL, release, as-of, licence, terms URL, cadence) to `scripts/common/sources.py`; the ingest at `scripts/ingest/<source>.py` reads it and downloads to `data/raw/<source>/` (gitignored). Idempotent: re-running uses cached files unless `--force`. Add the source to `docs/refresh.md` and `LICENSE-DATA.md`.
2. **Transform script** at `scripts/transform/build_<output>.py` joins, harmonizes, and emits Parquet (or GeoParquet) to `public/data/`.
3. **Catalog entry** — add a row to the registry in `scripts/transform/build_catalog.py` (`source_url`, `license`, `as_of`, `layers`, `redistributable` + `download_note`, optional `attribution`), then run it to regenerate `public/data/catalog.json` (rows/bytes/sha256/downloadable are computed). Never hand-edit the JSON. `/data`, `/methodology` and the Share menu read it at build time.
4. **Integrity test** — `tests/python/test_data_integrity.py` fails if a file in `public/data/` is not catalogued or its hash drifted.
5. **Methodology entry** — a section in `docs/methodology.md` (current state: source, as-of, coverage, units, gaps, scenario use) and a dated note in `docs/history.md` for the phase that added it.
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
