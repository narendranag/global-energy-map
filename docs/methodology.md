# Global Energy Map — Methodology

> This page is a chronological record of what shipped in each phase and the simplifications behind each layer. For a flat researcher-oriented inventory of current data sources, see `docs/data-sources.md`. For current totals (refinery count, layer counts, etc.) the live `/about` page renders from `public/data/catalog.json` at build time.

## Scope & Approach

Global Energy Map presents a multidimensional view of the world's hydrocarbon energy system — reserves, extraction, pipelines, refining, LNG, storage, ports, and bilateral trade — with chokepoint/pipeline disruption scenarios overlaid on the map. Phases 1–5 are shipped; Phase 6 (LNG carrier dynamics) is in review.

The narrative below preserves what each phase shipped with the caveats that applied AT THAT TIME. Where a later phase has materially changed a Phase N claim (e.g., Phase 5's refinery augmentation supersedes Phase 2's OSM-only counts), the original phase section keeps its historical claim and the later phase documents the upgrade. Cross-references are inline.

Phase 1 focuses on foundational layers:

- **Reserves choropleth (1990–2020)**: country-level proven crude reserves from Energy Institute Statistical Review, visualized as fill color on world map.
- **Extraction sites**: point locations of operating oil and gas fields from Global Energy Monitor, with capacity and status metadata.
- **Bilateral trade flows (1995–2024)**: crude oil exports and imports (HS code 2709) by bilateral partner pair, sourced from BACI and aggregated to annual flows.
- **Hormuz scenario**: a simple closure case where Saudi Arabia, UAE, and other Strait-dependent exporters lose seaborne capacity proportional to their routing share. Illustrates leverage exerted by the world's most critical chokepoint.

Phase 2 and beyond extended scope to include pipeline networks, refinery locations, LNG terminals, broader energy security scenarios, and enhanced trade flow visualizations; Phase 6 further added measured LNG carrier voyage dynamics on top of the terminal layer. See the phase sections below.

## Caveats & Simplifications

### Reserves Data Timing

The Energy Institute Statistical Review data underlying the reserves layer caps at 2020. The EI 2025 edition (published mid-2025) refreshed production figures through 2024 but did not update the reserves tables. This is a limitation of the source material, not a data processing error. Reserves figures should be interpreted as frozen as of 2020 for all years shown; any apparent post-2020 changes reflect display artifacts, not actual reserves discoveries or depletions.

### GEM Extraction Tracker Snapshot

Global Energy Monitor's Oil & Gas Extraction Tracker is a living dataset; the version ingested for Phase 1 is a snapshot from July 2023. More recent data is available directly from the GEM website but requires gated access via email-form signup. The capacity field is currently null across all assets and will be harmonized in Phase 2 once we reconcile production units across multiple GEM sheet exports.

### BACI Iran Suppression in 2023–2024

BACI suppressess low-value trade flows and certain sensitive countries to protect statistical disclosure. Iran (IRN) export records in 2024 show only one reported bilateral pair with a near-zero value. This suppression materially understates Iran's historical crude export market share and bilateral dependencies, particularly for countries in South and East Asia. The Hormuz scenario panel surfaces this caveat in the UI, noting that the impact on historically Iran-dependent importers is understated for recent years.

### Hormuz Routing Shares — Hardcoded Simplifications

The Hormuz scenario applies fixed routing shares based on engineering literature and EIA guidance:
- **Saudi Arabia**: 88% seaborne via Hormuz; 12% bypasses via the East-West pipeline to the Red Sea.
- **UAE**: 65% seaborne via Hormuz; 35% diverts via pipeline to Fujairah on the Gulf of Oman.
- **All other Gulf producers**: 100% Hormuz-dependent in the base scenario.

These shares are static simplifications. Phase 2+ will refine routing allocations using per-year export data (seaborne vs. pipeline shares from EIA, disaggregated by exporter) to better track the evolution of alternative export infrastructure.

## Phase 2: Oil Pipelines & Refineries

Phase 2 extends Phase 1's foundation by adding critical midstream and refining infrastructure, alongside additional disruption scenarios.

### Scope Additions

- **Oil pipelines (operating + in-construction)**: crude oil and NGL fuels transported via land and subsea routes, sourced from Global Energy Monitor's Global Oil Infrastructure Tracker (DigitalOcean CDN release 2025-04-09). Displayed as line features colored by commodity and status. **Attribution: "Data: Global Energy Monitor, CC BY 4.0"** is required.
- **Oil refineries**: point locations of petroleum refineries worldwide, sourced from OpenStreetMap (via Overpass API). Colored by bilateral feedstock attribution (see caveat below). 168 refineries ingested; geographic distribution skews toward Western Europe and North America.
- **Four disruption scenarios**:
  - **Hormuz** (Phase 1): Saudi Arabia and UAE export routes via Strait of Hormuz.
  - **Druzhba** (Phase 2): Russian crude pipeline to Central and Eastern Europe (DEU 60%, POL 95%, BLR/SVK/HUN 100%, CZE 90% routing shares).
  - **BTC** (Phase 2): Azerbaijan crude pipeline to Turkey (90% routing share).
  - **CPC** (Phase 2): Kazakhstan and Russian crude pipeline to the Black Sea (KAZ 80%, RUS 10% routing shares).

### Caveats & Simplifications

#### Refinery Feedstock Attribution is a Country Proxy

When a refinery R is located in country C, the model assigns it a capacity-share of C's bilateral crude import mix (BACI, HS 2709). This is a first-order simplification: actual refinery feedstock depends on API gravity compatibility, long-term contract structures, and per-refinery ownership. The method is informative for identifying which countries' import partners are material to a refinery's energy security, but should not be interpreted as precise accounting of individual-refinery sourcing. Real-world feedstock attribution requires detailed AECO (Association Petrolifère Européenne, etc.) refinery-level data, which is not publicly available at this temporal and geographic resolution.

#### OSM Refinery Coverage is Incomplete _(superseded by Phase 5)_

At Phase 2 time, OpenStreetMap's global refinery database underrepresented major refining hubs in China, India, Saudi Arabia, and South Korea. The 168 refineries ingested represented approximately 30–40% of global refining capacity by count, with the data skew being geographic (OECD countries overrepresented). **Phase 5 added NETL GOGI Refineries (2,272 features, US Government public domain) as the primary source with OSM kept as a 2 km same-country supplement.** The merged refinery layer is 2,360 features with much-improved coverage of Asian and Middle-Eastern hubs. See the Phase 5 section below.

#### OSM Refinery Capacity Coverage is Zero _(partially superseded by Phase 5)_

OpenStreetMap refinery features rarely include a capacity tag (API key: `output:capacity_*`). At Phase 2 time, all 168 OSM refineries fell back to uniform-within-country attribution: each refinery in country C is treated as 1/N of C's import mix. **Phase 5's NETL augmentation lifts global refinery capacity coverage from 0% to ~15%** (NETL's `capacity` field is populated for 355 / 2,272 records and parsed via a TDD'd helper). The remaining ~85% still uses the uniform-within-country fallback.

#### Net-Supplier Countries

Countries with negligible crude imports (Saudi Arabia, Russia, UAE, etc.) show refinery points in base color with a "domestic crude feed — model not informative for scenario analysis" tooltip. The model is most useful for net-importer refineries.

#### Pipeline Route Shares are Fixed Simplifications

Scenario routing shares are static:

- **Druzhba (Russia → Central Europe)**: DEU 60% of Russian crude, POL 95%, BLR/SVK/HUN 100%, CZE 90% — based on EIA and IEA pipeline throughput reports.
- **BTC (Azerbaijan → Turkey)**: 90% of Azeri crude routed through the Baku-Tbilisi-Ceyhan pipeline.
- **CPC (Kazakhstan + Russia → Black Sea)**: KAZ 80% routed via Caspian Pipeline Consortium, RUS 10% via CPC (the remainder uses Russian domestic routes not modeled).

Real-world shares vary year-to-year with maintenance, sanctions regimes, and renegotiation of joint-venture operating agreements. Phase 3+ will incorporate per-year EIA export flow data to improve routing allocations dynamically.

#### Pipeline GeoJSON Geometry Coverage _(at Phase 2 ship)_

At Phase 2 ship, the Global Energy Monitor oil pipeline GeoJSON source included 1,872 pipeline features, of which 24% lacked geometry. After filtering for valid geometries and operational status (in-service or in-construction), 1,185 features were retained. Abandoned or indefinitely deferred pipelines are excluded from the visualization but documented in the raw source for reference. **Phase 3 added gas pipelines (GGIT) on the same filtering rules**; the combined oil + gas pipelines table is now ~3,957 features. **Phase 5 simplified the GeoJSON sidecar from 73 MB to 14 MB at tolerance 0.005** (full-resolution geometry kept in `pipelines.parquet`).

## Phase 3: Natural Gas + LNG Terminals

Phase 3 extends the energy map to natural gas infrastructure and liquefied natural gas (LNG) trade, providing visibility into the second-largest component of the global energy system.

### Gas pipelines + LNG terminals

Source: **Global Energy Monitor — Global Gas Infrastructure Tracker** (CC BY 4.0). Filtered to operating + in-construction. Pipeline capacity is preserved in source units (typically bcm/y); LNG terminal capacity is preserved in mtpa.

Data: Global Energy Monitor, CC BY 4.0. https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/

### LNG trade flows — HS code choice

BACI HS 271111 (liquefied natural gas) is used for the Hormuz-LNG scenario specifically because the Strait of Hormuz only affects waterborne (liquefied) gas — pipeline gas (HS 271121) does not transit chokepoints. Aggregating to HS 2711 would mix the two and overstate Hormuz's reach.

### LNG terminal feedstock attribution

For each LNG import terminal `T` in country `C`, year `Y`:

```
terminal_capacity_share     = T.capacity / Σ(capacity of LNG import terminals in C)
country_lng_imports_from_X  = BACI[271111, Y].importer=C, exporter=X
historical_lng_from_X(T)    = terminal_capacity_share × country_lng_imports_from_X
```

With a scenario active, `terminal_at_risk = Σ_X historical_lng_from_X(T) × route_share(scenario, X, C)` and `terminal_share_at_risk = terminal_at_risk / Σ_X historical_lng_from_X(T)`. Terminals in countries with no LNG imports show zero exposure with a tooltip note.

Caveat (mirrors refinery model): contracted-offtake data is not used; attribution is purely capacity-weighted on import volumes. This is the country-proxy approximation, not actual cargo-level allocation.

### Gas reserves

Source: **Energy Institute Statistical Review of World Energy** — sheet `Gas - Proved reserves history`. Unit: trillion cubic metres (Tcm). Same temporal coverage as oil reserves.

## Phase 4 — NETL basins + storage + ports + URL state

### NETL Global Oil and Gas Infrastructure (GOGI)

Source: **National Energy Technology Laboratory (US Department of Energy)** — Global Oil and Gas Data ArcGIS portal (https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44). Data accessed via the public ArcGIS REST FeatureServer endpoints. License: **US Government work, public domain (17 USC §105)**.

Three layers ingested in Phase 4:
- **Basins** — petroleum-bearing geological basins (~1,046 polygons)
- **Storage hubs** — oil and gas storage facilities globally (~26,100 points; capacity in barrels)
- **Ports** — oil & gas handling ports (~3,700 points)

The NETL dataset also includes Wells (4.8M features), Power Plants, Mines, Processing Plants, Stations, Railways, Platforms/Pads, and Fields — out of Phase 4 scope, possible Phase 5+ candidates.

### Shareable URL state

The application's full UI state — year, commodity (oil/gas), active scenario, and visible-layer toggles — round-trips through the querystring. Every control change calls `router.replace` to keep the URL in sync without polluting browser history. Bookmarking or sharing a URL preserves the exact view.

Format:

```
?year=2020&commodity=gas&scenario=hormuz&layers=reserves,basins,gas_pipelines,lng_terminals
```

The `layers` querystring lists only ENABLED layers. **Forward-compat caveat:** when a future phase adds new layer toggles, URLs bookmarked from Phase 4 will load the new layers in their default-OFF state (since the bookmark's `layers=` list won't mention them). This is intentional — the URL is authoritative — so analysts sharing links know exactly what others will see.

### Basin layer

Basin polygons render as semi-transparent muted-brown fills beneath all point/line layers, with stroke at higher alpha. Tooltip on hover shows basin name, country, area (km²), and region.

### Geometry simplification

NETL's basin polygons are continent-scale and complex; the raw GeoJSON is 63 MB. Phase 4 simplifies basin geometries to ~1 km tolerance before publishing the sidecar (`public/data/basins.geojson` ~7 MB), since the map view at country scale doesn't need pipeline-grade precision for basins.

## Attribution — Data Sources

Attribution for all datasets used:

- **LNG-T3 (Zhou et al. 2026)**: "Data: Zhou et al. 2026, LNG-T3, CC BY 4.0 (Zenodo 10.5281/zenodo.19571058)" (required for LNG terminals, voyages, and daily flows — see Phase 6).
- **Global Energy Monitor extraction tracker**: "Data: Global Energy Monitor, CC BY 4.0" (this phrasing is mandatory for licensing compliance).
- **Global Energy Monitor oil infrastructure tracker**: "Data: Global Energy Monitor, CC BY 4.0" (required for pipelines).
- **OpenStreetMap** (refineries): "© OpenStreetMap contributors, ODbL 1.0" (required; ODbL allows derivative works with attribution and share-alike).
- **Energy Institute Statistical Review of World Energy**: Free and public; see Energy Institute terms of use.
- **BACI (CEPII bilateral trade)**: Free for academic and research use; consult CEPII terms for commercial applications.
- **UN Comtrade**: Not used in Phase 1 (BACI substituted as a pre-processed, deduplicated alternative).
- **EIA World Oil Transit Chokepoints**: Public domain (US government source).
- **Natural Earth base map**: Public domain.

## Reproducibility

Data ingestion and transformation follow a reproducible workflow:

1. Download raw sources (scripts log all URLs for transparency).
2. Process via Python uv environment: `uv run scripts/ingest/<source>.py` ingests and validates raw data; `uv run scripts/transform/build_<output>.py` produces final Parquet outputs.
3. Raw downloads are cached in `data/raw/` (gitignored for size); processed Parquet files are committed to `public/data/` for distribution.
4. Build logs and transformation scripts are version-controlled in the repository for audit.

All processing is deterministic and re-runnable. Data dependencies are minimal and explicitly declared.

## Phase 5 — Data quality polish

Phase 5 strengthens existing layers with three independent improvements: pipeline sidecar simplification, NETL refineries augmentation, and vintage-aware time filtering. No new commodity, no new scenarios.

### NETL Refineries augmentation

Source: **NETL Global Oil & Gas Infrastructure (US Department of Energy)** — `Refineries` FeatureServer. License: US Government work, public domain (17 USC §105). Adds ~2,272 refineries to the existing 168 OpenStreetMap features.

NETL is the primary source; OpenStreetMap is the supplement. For each OSM refinery, the build checks whether any NETL refinery falls within 2 km in the same country — if yes, the OSM record is dropped (NETL covers it). The 2 km threshold is the empirical knee of the OSM↔NETL nearest-neighbor distance distribution: matches ≤ 2 km are virtually always the same facility (Joliet/Joliet 0.12 km, Pembroke 0.02 km), while > 2 km may legitimately be distinct neighbors (e.g., Marcus Hook / Trainer in the Philadelphia refinery cluster).

NETL's `capacity` field is a string. A parser (`scripts/transform/_refinery_capacity.py`) handles both observed patterns — 97% pure numbers (e.g., `"59000"`) and 3% HTML-wrapped (e.g., `"<td>150,000 bpd crude capacity</td>"`). Unparseable / blank values produce NULL capacity; the scenario engine falls back to uniform-within-country attribution.

`source` column added to refinery rows: `"National Energy Technology Laboratory (US DOE) — GOGI Refineries"` or `"OpenStreetMap (Overpass)"`.

Capacity coverage improves from 0% (OSM-only) to ~15% (NETL's populated subset). Geographic skew shifts from OECD-heavy (OSM bias) toward global coverage (NETL includes major refineries in China, India, Saudi Arabia, South Korea that OSM under-tags).

### Vintage-aware time filtering

Pipelines and extraction sites become time-aware: the year slider now hides features whose build year is after the active year. A pipeline built in 2020 no longer appears on the 1990 map; an extraction site commissioned in 2015 no longer appears in 1990.

Coverage of vintage data in source:

| Layer | Vintage field | Populated |
|---|---|---|
| Oil + gas pipelines | `start_year` | 71% |
| Extraction sites | `commissioned_year` | 22% |
| Refineries | — | 0% |
| LNG terminals | `commissioned_year` | 97.8% _(Phase 6 — see below)_ |
| Storage hubs | — | 0% |
| Ports | — | 0% |

Features without populated vintage data appear in all years (preserves prior behavior). The 29% of pipelines and 78% of extraction sites without dates are always-visible regardless of slider position. Refineries, storage hubs, and ports have no vintage data in source and remain always-visible. **LNG terminals are the exception as of Phase 6**: LNG-T3's `start_year` column populates `commissioned_year` for 97.8% of the 313 LNG terminal rows, so the year slider now meaningfully filters LNG terminals too (see Phase 6 section).

`decommissioned_year` is 0% populated across all asset types; no decommission filtering is applied.

### Pipelines GeoJSON sidecar simplification

`public/data/pipelines.geojson` is simplified at `tolerance=0.005` (Shapely `simplify(tol, preserve_topology=True)`, corresponding to roughly 500 m in lon/lat units). This reduces the sidecar from ~73 MB to ~13 MB, clearing the 25 MB single-file ceiling without requiring Vercel Blob hosting. Full-resolution geometry is preserved in `pipelines.parquet`.

## Phase 6 — LNG carrier dynamics

Phase 6 lifts the LNG layer from "static terminal capacity (GEM)" to "measured global LNG flow (LNG-T3)." Three changes: LNG-T3 becomes the primary LNG terminal source with GEM as a 25 km supplement; voyages and daily trade/terminal flows are surfaced as three new parquets and a new opt-in ArcLayer; the Hormuz-LNG scenario adds a voyage-derived per-terminal attribution path for years 2020–2024, layered on top of (not replacing) BACI country totals.

### Source: Zhou et al. 2026 (LNG-T3)

Citation: Zhou C. (2026). *Global Marine LNG Terminals, Tankers & Trade (LNG-T3): A High-Resolution AIS-Based Dataset of LNG Trade Dynamics (2020–2024).* DOI: [10.5281/zenodo.19571058](https://doi.org/10.5281/zenodo.19571058). License: **CC BY 4.0**. Attribution: "Data: Zhou et al. 2026, LNG-T3, CC BY 4.0 (Zenodo 10.5281/zenodo.19571058)".

Five source CSVs are ingested: `LNG_terminal.csv` (545 terminals, 471 unique names), `LNG_tanker.csv` (fleet inventory, not surfaced as a Phase 6 layer), `LNG_tanker_voyage.csv` (17,592 AIS-derived voyages), `LNG_trade_daily.csv` (16,691 country-pair-day records), and `LNG_terminal_daily.csv` (16,115 terminal-day throughput records), all spanning 2020-01-01 → 2024-12-31.

### Terminal augmentation: LNG-T3 primary + GEM supplement

LNG-T3's 545 terminals filter to 330 active (`operating` + `construction`). Of those 330, 25 terminal names carry both an "operating" record and a separate "construction" (expansion-phase) record — `collapse_duplicate_names()` resolves each pair by keeping the operating record (falling back to higher capacity on ties), leaving **305 LNG-T3 terminals**. This means capacity reflects currently-operating trains only: e.g. Dahej LNG terminal keeps its 17.5 mtpa operating capacity, and a 5.0 mtpa under-construction expansion record for the same terminal is discarded.

GEM's raw GGIT geojson emits one feature per liquefaction/regasification train sharing a single terminal-level `pid`, and the terminal-level capacity field is already the terminal total — these are **not** verbatim-duplicate features (48 of the 84 duplicated pids differ in status, start-year, owner, tracker-custom, or geometry across their per-unit rows). The transform collapses each multi-unit pid down to one record per pid (operating preferred over in-construction, then highest capacity), using the same deterministic rule as the LNG-T3 name collapse above. The remaining GEM candidates are matched against LNG-T3 terminals within **25 km same-country** (larger than Phase 5's refinery 2 km threshold, because LNG terminal campuses are larger and same-port collisions less likely); GEM records with a match are dropped as already covered. **8 GEM terminals** survive as supplements (74 lng_export / 239 lng_import across the combined layer).

Result: **313 LNG terminals** total (305 LNG-T3 + 8 GEM), of `assets.parquet`'s 37,477 rows (a rebuild also purged 131 all-null orphan rows left behind by an earlier index-alignment bug). `capacity` covers 311/313 LNG rows and `commissioned_year` (populated from LNG-T3's `start_year`) covers **306/313 (97.8%)** — a dramatic jump from GEM-only Phase 3's 0%, and now the strongest-covered vintage field of any asset kind in the schema (see the vintage table above).

### LNG-T3 vs GIIGNL reconciliation

LNG-T3 daily arrivals aggregated to annual tonnage (cbm × 0.4245 t/cbm DOE LNG density convention). The table below is the verbatim output of `scripts/validate/lng_t3_vs_giignl.py`, checked in at `data/validation/lng_t3_vs_giignl.txt`:

```
Year   LNG-T3 Mt    GIIGNL Mt    Δ Mt       Gap %   
--------------------------------------------------
2020         76.6        356.1     -279.5    78.5%
2021        105.0        372.3     -267.3    71.8%
2022        136.0        401.5     -265.5    66.1%
2023        164.8        401.4     -236.6    58.9%
2024        129.4        407.0     -277.6    68.2%

2020 coverage ratio (LNG-T3 ÷ GIIGNL): 0.22
2021 coverage ratio (LNG-T3 ÷ GIIGNL): 0.28
2022 coverage ratio (LNG-T3 ÷ GIIGNL): 0.34
2023 coverage ratio (LNG-T3 ÷ GIIGNL): 0.41
2024 coverage ratio (LNG-T3 ÷ GIIGNL): 0.32

Partial-coverage AIS sample: scenario engine uses BACI totals with voyage-derived shares (see docs/methodology.md, Phase 6).
```

Every year exceeds the validation script's 30% acceptable-gap threshold — LNG-T3's AIS-derived arrivals cover only **22–41% of GIIGNL's global LNG trade** for 2020–2024, not the near-complete picture the original spec's open question had hoped for. **LNG-T3 is a partial-coverage AIS sample, and Phase 6 does NOT use it as a country-total source.** BACI HS 271111 remains the canonical country-level LNG import total for all years, including 2020–2024.

### Hormuz-LNG scenario refactor

Phase 3 implemented Hormuz-LNG as: BACI annual trade × capacity-weighted attribution from a country's total to its individual terminals. Phase 6 (`src/lib/scenarios/lng-t3.ts`) adds a voyage-informed disaggregation path for years 2020–2024, without ever letting LNG-T3 override a BACI country total:

- For years **2020–2024**, a country's LNG import total still comes from BACI HS 271111 (tonnes) — unchanged.
- Export voyages from LNG-T3 (`voyage_type = "export"`, `confidence_score >= 3`) are matched to import terminals by exact name against `to_terminal`. Where a country has covered terminals, its BACI total is redistributed across those terminals in proportion to voyage volume, and each terminal's exporter mix is set from its voyage-derived shares (not from capacity).
- Terminals in a covered country that received zero qualifying voyages show coverage `"none"` in the UI — an explicit **data gap**, never rendered as a zero-risk terminal.
- Countries with no covered terminals at all fall back entirely to the Phase 3 capacity-weighted split (coverage `"capacity-proxy"`, `dataSource: "baci"`).
- Years ≤ 2019 are unaffected; they always use the Phase 3 BACI × capacity-weighted path.

`0.4245` t/cbm (the DOE LNG density convention) is used only for the validation script's and UI's display conversion from cbm to tonnes — it never feeds the tonnes-conservation math above, which stays in BACI's native units.

### Voyage layer

An **"LNG voyages (2020–2024)"** toggle sits under the Gas layer group, **default off**. When enabled, a deck.gl ArcLayer renders great-circle arcs from export to import terminal, filtered server-side by the active year and `confidence_score >= 3` (dropping the lowest-confidence AIS matches). LNG terminals themselves now respect the year slider via the `commissioned_year` vintage field above. The terminal tooltip was enriched to show units (mtpa / bcm), total processed volume in bcm, UN/LOCODE, source, and — when a scenario is active — which attribution method (BACI capacity-proxy vs LNG-T3 voyage-derived) produced the terminal's risk figure. The ScenarioPanel carries a footnote for years 2020–2024 explaining the voyage-informed attribution path.

### What Phase 6 doesn't ship

- **Vessel fleet layer / animated trip visualization.** LNG-T3's fleet inventory has enough metadata for a vessel-at-position-on-date animation, but a deck.gl TripsLayer's complexity outweighs the analytical value over static arcs. Deferred to Phase 7+.
- **Daily time slider.** The annual slider stays; daily resolution exists in the parquets but isn't surfaced as UI.
- **Confidence-score threshold slider.** Fixed at >= 3; making it user-tunable is a Phase 7+ candidate.
- **MarineCadastre US-coastal oil tankers + EMODnet EU route density.** Separate datasets from LNG-T3, deferred to a separate phase.
