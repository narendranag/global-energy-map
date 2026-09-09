# Phase 6 — LNG Carrier Dynamics (Design Spec)

> **Status:** approved 2026-05-19. Plan: `docs/superpowers/plans/2026-05-19-global-energy-map-phase-6.md` (to be written).

## Goal

Lift the LNG layer from "static terminal capacity (GEM)" to "measured global LNG flow (LNG-T3)" by ingesting the Zhou 2026 LNG-T3 dataset (Zenodo `10.5281/zenodo.19571058`, CC BY 4.0). Three slices: terminals (LNG-T3 primary + GEM supplement), a new voyages arc layer with year filtering, and a refactor of the Hormuz-LNG scenario to use measured 2020–2024 daily flows instead of annual BACI × capacity-weighted attribution.

## Scope discipline

- **No new commodity** — still oil + gas axis. Coal stays deferred.
- **No new scenario** — Hormuz-LNG is refactored; Druzhba / BTC / CPC / Hormuz (oil) unchanged.
- **No vessel animation** — the 861-vessel fleet inventory is *not* surfaced as a layer; deferred to Phase 7. (See "Out of scope" below.)
- **Pre-2020 behavior preserved** — when the active year < 2020 the scenario engine falls back to existing BACI math. The 1995–2019 time series remains intact.

## Working set (probed 2026-05-19)

| LNG-T3 file | Rows | Use |
|---|---|---|
| `LNG_terminal.csv` | 545 (330 op+const) | Replaces GEM as LNG terminal primary; GEM kept as 25 km supplement |
| `LNG_tanker.csv` | 861 (406 active) | Reference for voyage IMO lookup; NOT rendered as a layer |
| `LNG_tanker_voyage.csv` | 17,592 | New `lng_voyage.parquet` → ArcLayer with year filter |
| `LNG_trade_daily.csv` | 16,691 | New `lng_trade_daily.parquet` → scenario engine input for year ∈ [2020, 2024] |
| `LNG_terminal_daily.csv` | 16,115 | New `lng_terminal_daily.parquet` → terminal-tooltip "throughput in year Y" |

License: **CC BY 4.0**. Cite Zhou et al. 2026 (Scientific Data) + the Zenodo DOI.

## Architecture

### 1. Terminals — LNG-T3 primary, GEM supplement (mirrors Phase 5 refinery pattern)

**Input:** `LNG_terminal.csv` filtered to `status ∈ {operating, construction}` (330 rows).

**Schema mapping:**

| LNG-T3 column | assets.parquet column | Notes |
|---|---|---|
| `name` | `name` | |
| `terminal_type` | `kind` | Map `export` → `lng_export`, `import` → `lng_import` |
| `areas` | `country_iso3` | Map via existing iso3 lookup; add new entries if probe reveals any unmapped |
| `lat` / `lon` | `lat` / `lon` | |
| `capacity` | `capacity` | mtpa (already our unit for LNG) |
| `start_year` | `commissioned_year` | 88% populated — feeds vintage filter |
| `unit_count` | (new) `unit_count` | Phase 6 schema addition |
| `total_processed_bcm` | (new) `total_processed_bcm` | Phase 6 schema addition |
| `UN_LOCODE` | (new) `un_locode` | Phase 6 schema addition |
| (constant) | `source` | `"LNG-T3 (Zhou 2026, Zenodo 10.5281/zenodo.19571058)"` |
| (constant) | `source_version` | `"LNG-T3 v1 (2026-04-01)"` |

**Dedup:** Same algorithm as Phase 5 refineries — proximity match against existing GEM LNG records. Probe showed 95% match within 10 km, 98% within 25 km. Use **25 km** threshold (larger than refineries' 2 km because LNG terminals are larger campuses with fewer in same port). GEM-only records: ~10 terminals (Ust Luga Russia, Polish Baltic FSRU, Soma Port Japan, Fuqing China, Ichthys FLNG Australia, Paldiski FSRU Estonia, Haiphong FSRU Vietnam, Gulf USA, Soma Port Japan).

**Vintage filter compatibility:** LNG-T3's `start_year` populates `commissioned_year` for 88% of records — vintage filter (Phase 5) gains real effect on LNG terminals (was 0% before).

**Idempotent rebuild:** `scripts/transform/build_lng_terminals.py` drops prior `lng_export` + `lng_import` rows from assets.parquet then re-appends. Source column lets downstream consumers distinguish.

### 2. Voyages — new layer + new parquet

**Input:** `LNG_tanker_voyage.csv` (17,592 rows), no filter (we keep all confidence levels and let UI/scenario filter).

**Schema:** `lng_voyage.parquet`

| Column | Type | Source |
|---|---|---|
| `voyage_id` | string | `start_date + "_" + IMO + "_" + voyage` |
| `start_date` | date | as-is |
| `end_date` | date | as-is |
| `imo` | int64 | `IMO` |
| `voyage_type` | string | `voyage` (values: `export`, `return`) |
| `from_terminal` | string | as-is |
| `to_terminal` | string | as-is |
| `from_country` | string | as-is (country name; map to ISO3 at build time) |
| `to_country` | string | as-is (country name; map to ISO3) |
| `from_country_iso3` | string | derived |
| `to_country_iso3` | string | derived |
| `amount_cbm` | int64 | `amount_cmb` (rename — fix the source's typo) |
| `confidence_score` | int8 | `confidence_score` (1–5) |
| `voyage_distance_km` | int64 | `voyage_distance` |

**Layer:** new `useLngVoyagesLayer` returning a deck.gl ArcLayer.

- Source/target = terminal lat/lon (looked up from `assets.parquet` by name)
- `getSourcePosition` / `getTargetPosition`
- Color: default by `voyage_type` (export = warm, return = cool). When the Hormuz-LNG scenario is active, override with scenario impact color (matching the existing red-tint convention for at-risk LNG import terminals) for voyages whose `from_country_iso3` is in the Hormuz-affected set.
- Opacity: scaled to `confidence_score` (1→0.25, 5→0.9)
- Width: scaled to `amount_cbm`
- **Year filter (Phase 5 vintage pattern):** keep voyage if `start_date.year <= active_year <= end_date.year`. Effectively shows voyages "in progress during year Y". For a year like 2020, that's ~2,400 arcs; 2023 peaks at ~4,800.
- **Min-confidence filter:** default `confidence_score >= 3` to drop the 2,532 lowest-confidence rows; surfaced as a toggle in scenario panel for power users (Phase 6.5 candidate — out of scope for the bundle).
- LayerPanel: new toggle under the Gas group, label "LNG voyages", default OFF (visual noise high; user opts in).
- Tooltip: from/to terminal + country, voyage_type, dates, amount_cbm (with mtpa equivalent), confidence_score.

**SQL:** queried via DuckDB-WASM from `read_parquet('/data/lng_voyage.parquet')` filtered server-side by year.

### 3. Daily trade flows — new parquet

**Input:** `LNG_trade_daily.csv` (16,691 rows).

**Schema:** `lng_trade_daily.parquet`

| Column | Type |
|---|---|
| `date` | date |
| `type` | string (`arrival` / `departure`) |
| `from_country` | string |
| `to_country` | string |
| `from_country_iso3` | string (derived) |
| `to_country_iso3` | string (derived) |
| `amount_cbm` | int64 |
| `voyage_distance_km` | float64 |
| `confidence_score` | int8 |

Used only by the scenario engine; no map layer.

### 4. Terminal daily throughput — new parquet

**Input:** `LNG_terminal_daily.csv` (16,115 rows).

**Schema:** `lng_terminal_daily.parquet`

| Column | Type |
|---|---|
| `terminal_name` | string |
| `date` | date |
| `processed_cbm` | int64 |

Used by the LNG terminal tooltip: "active-year throughput" sums `processed_cbm` for the active year and renders in mtpa (×0.42 ÷ 1e6 ÷ year-fraction-elapsed). 159 terminals have measurable flow data; the other 171 (LNG-T3 inventory minus daily-flow set) tooltip says "no measured throughput in 2020–2024 range".

### 5. Scenario engine refactor — Hormuz-LNG

**Current behavior (Phase 3):** for each LNG import terminal T in country C and active year Y:
- `country_lng_imports_from_X = BACI[271111, Y].importer=C, exporter=X` (annual tonnes)
- `terminal_share = T.capacity / sum(country LNG import terminal capacity)`
- `historical_lng_from_X(T) = terminal_share × country_lng_imports_from_X`
- Hormuz scenario applies `route_share(X, C, hormuz)` to compute `terminal_at_risk`

**Phase 6 behavior:**
- When `year ∈ [2020, 2024]`: use measured LNG-T3 flows
  - `country_lng_imports_from_X = sum(lng_trade_daily where date.year=Y, type='arrival', to=C, from=X)`
  - Convert to tonnes: `cbm × 0.4245` (LNG density approximation)
  - **Per-terminal disaggregation** also improves: voyage-level granularity lets us compute *terminal-level* shares directly (sum voyages where to_terminal=T) rather than capacity-proxy attribution. So:
  - `historical_lng_from_X(T) = sum(lng_voyage where date in Y, to_terminal=T, from_country=X) × density`
- When `year < 2020`: existing BACI behavior unchanged (pre-2020 time series preserved)

**Scenario engine API:** `computeLngImportImpacts({lngImports, flowsByImporter, lookupShare, voyagesByTerminal?, year, dataSource})` where `dataSource ∈ {'baci', 'lng-t3'}` is computed once from `year` and passed in. Tests for both paths.

**Test fixtures:**
- Existing Phase 3 hormuz-gas tests stay (cover the BACI path with year < 2020 fixtures)
- New tests cover the LNG-T3 path (synthetic voyages for year=2023, verify terminal-level disaggregation)

### 6. Catalog v5

Two new entries:

```json
{
  "id": "lng_t3_terminals",
  "label": "LNG terminals (LNG-T3 primary)",
  "path": "/data/assets.parquet",
  "format": "parquet",
  "source_name": "Zhou et al. 2026, LNG-T3 (Zenodo)",
  "source_url": "https://doi.org/10.5281/zenodo.19571058",
  "license": "CC BY 4.0",
  "as_of": "2026-04-01",
  "layers": ["lng_terminals"]
},
{
  "id": "lng_t3_voyages",
  "label": "LNG carrier voyages + daily flows (LNG-T3)",
  "path": "/data/lng_voyage.parquet",
  "format": "parquet",
  "source_name": "Zhou et al. 2026, LNG-T3 (Zenodo)",
  "source_url": "https://doi.org/10.5281/zenodo.19571058",
  "license": "CC BY 4.0",
  "as_of": "2026-04-01",
  "layers": ["lng_voyages", "scenario:hormuz-lng"]
}
```

`gem_gas_infrastructure` entry's label updated to reflect "gas pipelines + LNG terminals (supplement)".

Version bump 4 → 5. `src/lib/data-catalog/index.ts` allowlist extended.

## File structure

**Python (new):**
- `scripts/ingest/lng_t3.py` — downloads from Zenodo, caches under `data/raw/lng_t3/<version>/`
- `scripts/transform/build_lng_terminals.py` — *modified* to load LNG-T3 as primary + GEM as supplement (mirrors Phase 5's build_refineries.py pattern)
- `scripts/transform/build_lng_voyages.py` — new; writes `lng_voyage.parquet` + `lng_trade_daily.parquet` + `lng_terminal_daily.parquet`
- `scripts/common/iso3.py` — extend with `LNG_T3_NAME_TO_ISO3` dict for any unmapped country names probed during ingest

**Python tests (new):**
- `tests/python/test_lng_t3_country_mapping.py` — unit test that all country names from the three CSV files map to known ISO3 codes
- `tests/python/test_lng_voyage_schema.py` — schema/dtype assertions on the output parquet

**TypeScript (new):**
- `src/components/layers/LngVoyagesLayer.tsx` — new `useLngVoyagesLayer` hook returning an ArcLayer
- `src/lib/scenarios/lng-t3.ts` — new pure functions for LNG-T3-based flow attribution
- Modified: `src/lib/scenarios/lng.ts` — branching logic (year ∈ [2020,2024] ? use lng-t3 : use baci)
- Modified: `src/lib/scenarios/types.ts` — add `LngVoyageRow`, `LngTradeDailyRow`, extend `LngImportImpact` with `dataSource: 'baci' | 'lng-t3'` field
- Modified: `src/components/layers/LayerPanel.tsx` — add `lng_voyages` toggle in `LayerState` and Gas group
- Modified: `src/lib/url-state/encode.ts` — `LayerState` interface grows by one field
- Modified: `src/app/page.tsx` — mount voyage layer, thread year + scenario impact

**TypeScript tests (new):**
- `tests/unit/scenarios/hormuz-lng-t3.test.ts` — LNG-T3 path with synthetic voyages
- `tests/unit/url-state/encode.test.ts` — already exists; extend to cover the new `lng_voyages` flag

## Schema deltas (full)

| Table | Change |
|---|---|
| `assets.parquet` (lng_export / lng_import rows) | LNG-T3 primary (330 active) + GEM supplement at 25 km dedup; new columns: `unit_count`, `total_processed_bcm`, `un_locode`; `source` and `commissioned_year` now populated for ~88% (was 0%) |
| `lng_voyage.parquet` | NEW — 17,592 rows |
| `lng_trade_daily.parquet` | NEW — 16,691 rows |
| `lng_terminal_daily.parquet` | NEW — 16,115 rows |
| `catalog.json` | version=5; two new entries; updated GEM entry label |
| `src/lib/data-catalog/index.ts` | version allowlist += 5 |
| `LayerState` (LayerPanel + url-state) | add `lng_voyages: boolean` (default false in DEFAULTS) |

## Open questions to validate during implementation

These were probe-found and must be resolved before merge (not blocking the plan, but addressed during the build).

### 1. BACI vs LNG-T3 discrepancy

LNG-T3 daily arrivals sum to ~76 Mt in 2020; BACI HS 271111 reports 484 Mt for 2020. That's a 6× difference. Industry consensus (GIIGNL) puts 2020 global LNG trade at ~360 Mt.

Suspect: **BACI 271111 double-counts re-exports** — when an LNG cargo touches multiple HS records (e.g., an exporter re-exporting from a hub), BACI's mirror-reconciliation may not collapse them, and LNG re-exports are common (e.g., US LNG re-exported via UK/Spain hubs).

LNG-T3 may also be undercounting (it captures voyage-detection-confidence cargoes only). The paper claims GIIGNL validation; we need to reproduce that check.

**Implementation must:**
- Document the discrepancy in methodology.md
- Compare LNG-T3 annual totals to GIIGNL public numbers (~360 Mt global 2020, ~400 Mt 2023)
- If LNG-T3 underreports vs GIIGNL by < 30%, accept it as the lower-bound truth and note the caveat
- If the gap is larger, escalate before merge

### 2. Terminal-name join for voyages

`lng_voyage.csv` references terminals by name; we need to join to LNG-T3 terminal coordinates. **Probe finding:** all voyage from/to terminals appear in LNG_terminal.csv by exact-string match (need to confirm at build time — assert 100% join). If any voyages reference a terminal not in the inventory, drop those rows and log.

### 3. Country-name → ISO3 coverage

LNG-T3 uses country *names* in voyages and trade_daily. Some may differ from prior `*_NAME_TO_ISO3` dicts. Pre-build assertion: every unique country name from the three CSVs maps to ISO3 or is logged. Add a `LNG_T3_NAME_TO_ISO3` dict for anything new.

### 4. LNG density constant

We use `cbm × 0.4245` (tonnes per cubic meter at -162°C) to convert LNG-T3 cubic meters to BACI-comparable tonnes. Sources vary 0.41–0.46. Pick 0.4245 (DOE conventional value), document in methodology.

### 5. Voyage layer arc rendering at year=2023 (4,846 arcs)

deck.gl ArcLayer handles 5k arcs easily, but the year filter must be evaluated in SQL/DuckDB to avoid round-tripping all 17,592 rows on every year change. Use `WHERE start_year <= year AND end_year >= year` in the DuckDB query.

## Out of scope (deferred to Phase 7+)

- **Vessel fleet layer / animated TripsLayer.** The 861-vessel inventory carries enough metadata to render an animated `vessel-at-position-on-date(Y)` layer interpolating along voyage paths. Significant deck.gl scope (TripsLayer + per-frame state) and minimal analytical value over the static arcs. Defer.
- **Daily time slider.** Current slider is annual; LNG-T3 has daily resolution. Adding a daily slider is a separate UX project.
- **Confidence-score user-tunable threshold.** Default >= 3 in Phase 6; making it a slider in the UI is a Phase 7+ enhancement.
- **MarineCadastre US-coastal oil tankers.** Same general thesis (AIS-derived) but separate dataset, separate phase. See research memo.
- **EMODnet EU route density.** Same.
- **Pre-2020 LNG voyage coverage.** LNG-T3 starts at 2020-01-01. The 1995–2019 BACI fallback is the answer for that range.

## Definition of done

- LNG-T3 ingested into 3 new parquets + 1 modified parquet
- LNG terminal count is ~340 (LNG-T3 active 330 + ~10 GEM-only after 25 km dedup)
- LNG-T3 annual totals validated within 30% of GIIGNL public numbers; discrepancy documented in methodology.md
- New voyages ArcLayer toggles cleanly under LayerPanel "Gas" group, default OFF, respects active year
- Hormuz-LNG scenario for `year=2020` uses measured LNG-T3 flows; for `year=2019` uses BACI (regression test)
- `pnpm lint` / `pnpm test` / `uv run pytest tests/python` clean
- `pnpm build` succeeds
- Catalog v5 parses
- Methodology page documents the BACI / LNG-T3 / GIIGNL reconciliation and the per-terminal disaggregation improvement
- Single bundled PR + Opus code review + follow-up docs flip (Phase 5 ship pattern)

## Risks

| Risk | Mitigation |
|---|---|
| LNG-T3 vs GIIGNL gap is large (>30%) | Escalate before merge. If the dataset materially under-reports, the scenario refactor is a regression; pivot to "LNG-T3 voyages as supplementary layer, BACI still drives scenario" |
| Terminal name join fails for some voyages | Build script asserts 100% join coverage; drops + logs misses; if > 5% miss, escalate |
| Voyage ArcLayer visual clutter at 4.8k arcs (2023) | Default OFF in LayerPanel; min confidence 3 filter; user opt-in only |
| LayerState forward-compat (Phase 4 URLs missing the new field) | The `useUrlState` decoder already defaults missing fields; Phase 4-bookmarked URLs land with `lng_voyages: false` — that's correct (intentional opt-in) |

---

End of spec.
