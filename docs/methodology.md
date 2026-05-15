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

## Attribution — Data Sources

Attribution for all datasets used:

- **Global Energy Monitor extraction tracker**: "Data: Global Energy Monitor, CC BY 4.0" (this phrasing is mandatory for licensing compliance).
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
