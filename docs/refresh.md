# Data refresh runbook

How to bring each upstream source up to date, rebuild `public/data/`, check the result, and record what changed. Everything here is build-time: the browser never calls a data provider.

**The one rule:** never change a file in `public/data/` without regenerating `catalog.json` in the same commit. `scripts.build_all` always ends with `build_catalog`, so running it (rather than a single transform) is the safe default. The catalog's `sha256` is what `/data` shows, what `tests/python/test_data_integrity.py` checks, and what the app uses to version data URLs for caching — a stale hash means stale caches.

## Where the pins live

Every upstream URL, release label and as-of date is in **`scripts/common/sources.py`** (one `SourcePin` per source). Ingests download from the pin; transforms stamp `source_version` from it; `build_catalog` copies its `as_of` into `catalog.json`. To move to a new release, edit the pin — not the ingest or transform.

| Pin | Source | Usual cadence | Ingest module | Raw snapshot |
|---|---|---|---|---|
| `EI` | Energy Institute Statistical Review | annual, late June | `ei_statistical_review` | `data/raw/ei_statistical_review/` |
| `BACI` | CEPII BACI HS92 | annual, January–February | `baci` | `data/raw/baci/` |
| `GEM_GOGET` | GEM Oil & Gas Extraction Tracker | per tracker release (irregular) | `gem_extraction` | `data/raw/gem_extraction/` |
| `GEM_GOIT` | GEM Oil Infrastructure Tracker | per tracker release | `gem_oil_infra` | `data/raw/gem_oil_infra/` |
| `GEM_GGIT` | GEM Gas Infrastructure Tracker | per tracker release | `gem_gas_infra` | `data/raw/gem_gas_infra/` |
| `LNG_T3` | LNG-T3 (Zenodo) | per Zenodo version | `lng_t3` | `data/raw/lng_t3/<release>/` |
| `NETL` | NETL GOGI ArcGIS layers | ad hoc (live, unversioned) | `netl_gogi` | `data/raw/netl/` |
| `OSM` | OpenStreetMap refineries (Overpass) | quarterly | `osm_refineries` | `data/raw/osm_refineries/` |
| `NATURAL_EARTH` | Natural Earth 1:110m countries | rarely | none (static `countries.geojson`) | — |

`data/raw/` is gitignored; the raw snapshot on the maintainer's machine is the build input. A fresh clone must run the ingests once (`--ingest`) before `build_all` can run.

## Commands

```bash
uv sync                                        # Python deps
uv run python -m scripts.build_all             # every transform, then the catalog (no network)
uv run python -m scripts.build_all --ingest    # every ingest first, then every transform (network)
uv run python -m scripts.build_all --from build_refineries   # one transform and everything after it
uv run python -m scripts.ingest.<module> --force             # re-download one source (see table)
uv run python -m scripts.ingest.netl_gogi storage ports      # NETL: chosen layers only
```

Ingests skip files that already exist unless given `--force` (NETL and the `lng_t3` extract always re-fetch / re-extract). Most use a new file name per release, so a new release downloads alongside the old one and the transforms pick the newest by file name (`scripts/common/paths.py: latest`). Move superseded raw files out of `data/raw/<source>/` if you want to be certain which one is used.

## Per-source procedure

For every source: (1) check the publisher's page for a new release and read its release notes and licence (update `LICENSE-DATA.md` if the terms changed); (2) edit the pin; (3) run the ingest; (4) run `build_all`; (5) run the checks below; (6) write the changelog entry; (7) commit the pin, the rebuilt `public/data/`, `src/lib/export/citations.generated.json` and the docs together.

### Energy Institute Statistical Review (annual, ~June)
- Pin: set `release` to the new edition year, `as_of` to its publication date. The EI workbook URL changes every year — find the "all data" xlsx on the downloads page and set `download_url`. The site blocks scripted downloads (Cloudflare); if the ingest fails, download the workbook by hand into `data/raw/ei_statistical_review/`.
- `build_country_year` reads sheet names and year columns; a new edition can rename sheets or add countries. Watch its output for unmapped country names (add them to `EI_NAME_TO_ISO3` in `scripts/common/iso3.py`).
- Check whether reserves were updated this year (they stopped at 2020 in the 2025 edition). `test_reserves_end_2020_and_non_negative` and the "reserves frozen after 2020" badge must be updated if they were.

### CEPII BACI (annual, ~January–February)
- Pin: set `release` (e.g. `V202701`), `as_of`, and `download_url` (`BACI_HS92_<release>.zip`).
- **The ingest range-reads the zip, so its byte offsets are release-specific**: re-derive `_ZIP_FILE_SIZE`, `_YEAR_ENTRIES` and the `_CC_*` constants in `scripts/ingest/baci.py` from the new archive's central directory, and add the new year to `_YEAR_ENTRIES`. The country-codes file is versioned (`country_codes_<release>.csv`).
- After the build, check `test_trade_flow_codes_are_real_countries` (new BACI pseudo-codes go into `TRADE_ISO3_ALLOWLIST`) and extend the year slider range only if the app's year constants allow it.

### GEM trackers (per release)
- GOIT / GGIT: GEM's public GeoJSON lives on its DigitalOcean CDN; find the new file name in the tracker map config (`https://globalenergymonitor.github.io/maps/trackers/<tracker>/config.js`) and set `download_url`, `dest_filename`, `release` and `as_of`.
- GOGET: the xlsx is behind GEM's email form. Download it by hand into `data/raw/gem_extraction/` (or pin a Wayback capture as today) and set `release` to GEM's label (e.g. `"March 2025"`).
- A GGIT release changes both gas pipelines and the 7 supplementary LNG terminals; watch `build_lng_terminals`' dedup counts.

### LNG-T3 (per Zenodo version)
- Check the concept DOI (`extra["concept_doi"]`) for a newer version. Pin its record id in `LNG_T3_RECORD_ID`, `release` (the label becomes the raw directory and every row's `source_version`), `as_of` (publication date) and the per-CSV `md5:` values from `https://zenodo.org/api/records/<id>`.
- After the ingest, compare checksums: `md5 data/raw/lng_t3/<release>/*.csv` must match the pin.
- `build_lng_voyages` asserts every voyage terminal resolves to an LNG terminal row (the name is the join key) — a renamed terminal fails the build loudly; fix the name map, not the assertion.

### NETL GOGI (ad hoc)
- NETL serves live layers with no versions. Re-ingest when you want newer data, then set `NETL.release` and `NETL.as_of` to the retrieval date (the ingest stamps `_fetched_at` in each raw GeoJSON). Expect small count changes in basins, storage, ports and refineries.
- Refinery dedup (`build_refineries`) is sensitive to NETL's duplicate listings; check `test_no_two_netl_refineries_within_1km_same_country`.
- Storage is filtered to bulk-storage records (`build_storage.is_bulk_storage` drops EPA cleanup sites, SPCC plans, a state master list and transfer points). A NETL re-ingest can add new source categories; watch the transform's kept/dropped counts before accepting a large row-count move.

### OpenStreetMap refineries (quarterly)
- `uv run python -m scripts.ingest.osm_refineries --force`, then set `OSM.release`/`as_of` to the retrieval date. The OSM supplement count (88 today) will move; `assets_open.parquet` excludes it automatically.

## Checks after a refresh

1. `uv run python -m pytest tests/python -q` — schema, integrity (every file catalogued with matching size and sha256), open-extract (`assets_open` = assets − OSM), pins, catalog policy.
2. Run `uv run python -m scripts.build_all` a second time: `git status` must show no further changes (byte-identical rebuild).
3. Diff what `/data` will show: `git diff public/data/catalog.json` — rows, bytes, sha256 and as-of per entry. Every row-count jump should have an explanation (new release, new countries, dedup change).
4. `uv run python -m scripts.validate.lng_t3_vs_giignl` after an LNG-T3 refresh — coverage ratios should stay in the same band (22–41 % for 2020–24); add GIIGNL's newest headline total to the script if a year was added.
5. Scenario spot checks in the app (`pnpm dev`): Hormuz crude 2023, Hormuz LNG 2023 and Druzhba 2021 — compare the ranked importers with the previous deploy (the scenario CSV export makes this a file diff). Big moves need a reason in the changelog.
6. `pnpm test` (unit tests import `catalog.json`) and, before merging, the e2e suite.
7. If a source's licence changed, update `LICENSE-DATA.md`, the `license`/`redistributable` fields in `scripts/transform/build_catalog.py`, and the map footer (`src/components/ui/MapFooter.tsx`).

## Data changelog

Record every data change here, newest first: date, source and release, files affected, row-count deltas from the catalog diff, and anything a researcher comparing old and new numbers needs to know.

```
### YYYY-MM-DD — <source> <old release> → <new release>
- Files: ...
- Rows: <entry> 1,234 → 1,300 (+66) ...
- Notes: ...
```

### 2026-09-11 — storage filtered to bulk storage (no upstream refresh)
- Files: `assets.parquet`, `assets_open.parquet`, `catalog.json`.
- Rows: `netl_storage` 26,102 → 7,733 (−18,369); `assets_open.parquet` 36,191 → 17,822.
- Notes: dropped EPA leaking-underground-storage-tank cleanup sites (6,025), SPCC spill-prevention plans (11,513), an EPA state master list (721) and rail/truck/air/port transfer points (110). Kept EPA Facility Response Plan sites (3,669, including the SPR), EIA petroleum terminals (1,460) and all 2,601 non-US rows. The US share of the layer falls from 90 % to 66 % (5,132 US rows).

### 2026-09-11 — Hormuz intra-Gulf share-0 pairs (no upstream refresh)
- Files: `disruption_route.parquet`, `catalog.json`.
- Rows: 18 → 72 (+54: 42 crude and 12 LNG exporter → other-Gulf-coast-country pairs at share 0, `GULF_COASTAL` in `build_disruption_routing.py`).
- Notes: cargoes that stay inside the Gulf never cross the strait, so they are no longer counted as exposed. Al Zour (Kuwait) LNG 73.4 % → 0 %, Bahrain crude 88 % → 0 %, Jebel Ali 93.4 % → 39.4 % (2023). World crude at risk in 2024 moves only slightly, 27.91 % → 27.86 %, and Kuwait's exporter contribution from 993 to 971 kb/d. Flows *into* the Gulf from outside remain out of scope.

### 2026-09-10 — Phase 10 (no upstream refresh)
- New file `assets_open.parquet` (36,191 rows): `assets.parquet` minus its 88 OpenStreetMap rows, offered for download on `/data`.
- Source pins consolidated into `scripts/common/sources.py`; every existing data file rebuilt byte-identical.
- Catalog metadata only: CEPII BACI licence corrected to Etalab Open Licence 2.0 (was "academic/research use"); NETL entries carry an attribution line; EI licence wording aligned with EI's terms.
