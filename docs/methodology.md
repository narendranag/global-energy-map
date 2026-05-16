# Global Energy Map — Methodology

## Scope & Approach

Global Energy Map presents a multidimensional view of crude oil reserves, production, trade, and critical infrastructure. Phase 1 focuses on foundational layers:

- **Reserves choropleth (1990–2020)**: country-level proven crude reserves from Energy Institute Statistical Review, visualized as fill color on world map.
- **Extraction sites**: point locations of operating oil and gas fields from Global Energy Monitor, with capacity and status metadata.
- **Bilateral trade flows (1995–2024)**: crude oil exports and imports (HS code 2709) by bilateral partner pair, sourced from BACI and aggregated to annual flows.
- **Hormuz scenario**: a simple closure case where Saudi Arabia, UAE, and other Strait-dependent exporters lose seaborne capacity proportional to their routing share. Illustrates leverage exerted by the world's most critical chokepoint.

Phase 2 and beyond will extend scope to include pipeline networks, refinery locations, LNG terminals, broader energy security scenarios, and enhanced trade flow visualizations.

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

#### OSM Refinery Coverage is Incomplete

OpenStreetMap's global refinery database, while substantial, underrepresents major refining hubs in China, India, Saudi Arabia, and South Korea. The 168 refineries ingested represent approximately 30–40% of global refining capacity by count; the data skew is geographic (OECD countries overrepresented). As OSM contributors add refinery features in Asia-Pacific and Middle East regions, the engine's completeness will improve without code changes. Current gaps should be noted when interpreting refinery-level scenarios in underrepresented regions.

#### OSM Refinery Capacity Coverage is Zero

OpenStreetMap refinery features rarely include a capacity tag (API key: `output:capacity_*`). The engine therefore falls back to uniform-within-country attribution: each refinery in country C is treated as 1/N of C's import mix, where N is the count of refineries in C. This is a placeholder; once OSM capacity tagging improves (e.g., via GEM data import or regional energy agency contributions), the engine will automatically switch to capacity-weighted attribution with zero code changes.

#### Net-Supplier Countries

Countries with negligible crude imports (Saudi Arabia, Russia, UAE, etc.) show refinery points in base color with a "domestic crude feed — model not informative for scenario analysis" tooltip. The model is most useful for net-importer refineries.

#### Pipeline Route Shares are Fixed Simplifications

Scenario routing shares are static:

- **Druzhba (Russia → Central Europe)**: DEU 60% of Russian crude, POL 95%, BLR/SVK/HUN 100%, CZE 90% — based on EIA and IEA pipeline throughput reports.
- **BTC (Azerbaijan → Turkey)**: 90% of Azeri crude routed through the Baku-Tbilisi-Ceyhan pipeline.
- **CPC (Kazakhstan + Russia → Black Sea)**: KAZ 80% routed via Caspian Pipeline Consortium, RUS 10% via CPC (the remainder uses Russian domestic routes not modeled).

Real-world shares vary year-to-year with maintenance, sanctions regimes, and renegotiation of joint-venture operating agreements. Phase 3+ will incorporate per-year EIA export flow data to improve routing allocations dynamically.

#### Pipeline GeoJSON Geometry Coverage

The Global Energy Monitor GeoJSON source includes 1,872 pipeline features, of which 24% lack geometry. After filtering for valid geometries and operational status (in-service or in-construction), 1,185 features are retained. Abandoned or indefinitely deferred pipelines are excluded from the visualization but documented in the raw source for reference.

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

## Attribution — Data Sources

Attribution for all datasets used:

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
