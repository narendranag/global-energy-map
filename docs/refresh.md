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
| `GEM_ROUTES` | GEM GOIT/GGIT pipeline route geometry (GitHub) | continuous | `gem_pipeline_routes` | `data/raw/gem_pipeline_routes/` |
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

## Archived source snapshots (Cloudflare R2)

Some build inputs can no longer be downloaded from their publisher: GEM emptied its public CDN and answers 410 at the origin, and the EI workbook is Cloudflare-gated. Those files are archived to the R2 bucket **`global-energy-map-raw`**, which for the GOIT/GGIT snapshots is the *only* copy besides this machine. `MANIFEST.md` in the bucket lists every key, its size and its sha256.

This is build-time only — the app never reads the bucket, and nothing in `public/data/` depends on it.

```bash
set -a; . ~/.config/secrets.env; set +a
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto

# what is archived
aws s3 ls s3://global-energy-map-raw/ --recursive --human-readable --endpoint-url "$R2_ENDPOINT"

# restore everything into data/raw/ (keys mirror the data/raw/ layout)
aws s3 sync s3://global-energy-map-raw/ data/raw/ --exclude MANIFEST.md --endpoint-url "$R2_ENDPOINT"

# add a new file
aws s3 cp data/raw/<dir>/<file> s3://global-energy-map-raw/<dir>/<file> --endpoint-url "$R2_ENDPOINT"
```

After restoring, `uv run python -m scripts.build_all` rebuilds `public/data/` from scratch. Verify against the manifest's sha256 if a build output looks unexpected.

Also archived (2026-09-19): `eia_steo/dpr-data.xlsx`, the Drilling Productivity Report workbook whose `RegionCounties` sheet defines the shale regions — EIA discontinued the DPR, so the file may disappear — and, beside it, the Census `cb_2023_us_county_20m.zip` it is dissolved over. The Census zip is still fetchable; it is there so the outlines rebuild from one place.

Deliberately **not** archived, because they are still publicly fetchable: BACI (CEPII), LNG-T3 (Zenodo, md5-pinned in the source pin), NETL (live ArcGIS), OSM (live Overpass), and GEM's `goit-ggit-pipeline-routes` repo (GitHub). Archiving those would be a stale copy to maintain, not insurance.

## Per-source procedure

For every source: (1) check the publisher's page for a new release and read its release notes and licence (update `LICENSE-DATA.md` if the terms changed); (2) edit the pin; (3) run the ingest; (4) run `build_all`; (5) run the checks below; (6) write the changelog entry; (7) commit the pin, the rebuilt `public/data/`, `src/lib/export/citations.generated.json` and the docs together.

### Energy Institute Statistical Review (annual, ~June)
- Pin: set `release` to the new edition year, `as_of` to its publication date. The EI workbook URL changes every year — find the "all data" xlsx on the downloads page and set `download_url`. The site blocks scripted downloads (Cloudflare); if the ingest fails, download the workbook by hand into `data/raw/ei_statistical_review/`.
- `build_country_year` reads sheet names and year columns; a new edition can rename sheets or add countries. Watch its output for unmapped country names (add them to `EI_NAME_TO_ISO3` in `scripts/common/iso3.py`).
- Check whether reserves were updated this year (still 2020 as of the 2026 edition — checked 2026-09-17). `test_reserves_end_2020_and_non_negative` and the "reserves frozen after 2020" badge must be updated if they ever are.
- **Save the workbook as `EI-Stats-Review-ALL-data-<edition>.xlsx`.** Transforms take the lexicographically last match, so EI's own bare `EI-Stats-Review-ALL-data.xlsx` would outrank `...-2026.xlsx` and silently build the older edition.
- **EI renames sheets between editions**, including trailing whitespace (`"Gas - Proved reserves history "` lost its trailing space in 2026). `_read_sheet` matches on the stripped name and lists the available sheets when one is genuinely missing.
- `test_production_reaches_the_edition_year` derives the expected last year from the pin (`int(EI.release) - 1`), so a refresh does not need the test edited.

### CEPII BACI (annual, ~January–February)
- Pin: set `release` (e.g. `V202701`), `as_of`, and `download_url` (`BACI_HS92_<release>.zip`).
- **The ingest range-reads the zip, so its byte offsets are release-specific**: re-derive `_ZIP_FILE_SIZE`, `_YEAR_ENTRIES` and the `_CC_*` constants in `scripts/ingest/baci.py` from the new archive's central directory, and add the new year to `_YEAR_ENTRIES`. The country-codes file is versioned (`country_codes_<release>.csv`).
- After the build, check `test_trade_flow_codes_are_real_countries` (new BACI pseudo-codes go into `TRADE_ISO3_ALLOWLIST`) and extend the year slider range only if the app's year constants allow it.

### GEM trackers (per release)

**The DigitalOcean CDN is dead (confirmed 2026-09-17).** GEM reorganised the `publicgemdata` bucket around 2026-07-02. The old `GOIT/`, `ggit/` and `goget/` prefixes are gone; `Current_maps/{goit,ggit,goget}/` exist but contain only folder markers. A full paginated listing (40,788 keys) finds no tracker data file anywhere in the bucket. The tracker map configs still reference the old URLs, so **the configs are stale too** — do not trust them.

GEM has also purged direct file downloads at the origin: `globalenergymonitor.org/wp-content/uploads/.../<tracker>.xlsx` answers **410 Gone**, not 404. Read that as deliberate — assume bulk access is now form-gated by design and plan for a manual step.

Where the data actually is, in the order worth trying:

1. **Wayback, for the xlsx trackers.** The Internet Archive has GEM's WordPress uploads even though the origin purged them. Query the CDX API for `globalenergymonitor.org/wp-content/uploads/*` and grep for the tracker name; fetch with the `id_` suffix (`https://web.archive.org/web/<timestamp>id_/<original-url>`) to get the raw bytes rather than the Wayback frame. This is how the `GEM_GOGET` pin already works.
2. **The `GlobalEnergyMonitor/goit-ggit-pipeline-routes` GitHub repo**, for pipeline geometry: `data/individual-routes/{gas,liquid,hydrogen}-pipelines/<pipeline-id>.geojson`, full resolution, thousands of files, actively pushed. Pull it as one tarball (`gh api repos/GlobalEnergyMonitor/goit-ggit-pipeline-routes/tarball`), not file-by-file. Geometry only — no capacity/status/country attributes.
3. **The GreenInfo tracker map's static export**, for pipeline attributes: `https://greeninfo-network.github.io/global-oil-infrastructure-tracker/static/data/data.csv` (HTTP 200, 767 KB, 1,018 rows = 979 oil + 39 NGL, `start_year` 66%). Carries attributes plus a simplified `route` vertex list, but **no ISO3 start/end columns** — our schema needs those derived. No GGIT equivalent has been found.
4. GEM's email form, by hand, as the last resort.

- GOGET: set `release` to GEM's own label (e.g. `"March 2026"`) and `download_url` to the Wayback `id_` URL, keeping `extra["original_url"]` as the CDX fallback target.
- A GGIT release changes both gas pipelines and the 7 supplementary LNG terminals; watch `build_lng_terminals`' dedup counts.
- **GEM renames workbook columns between releases.** The March 2026 GOGET workbook replaced the single `Main data` sheet with `Field-level main data` / `Project-level main data`, and within it `Unit name` → `Unit Name`, `Country` → `Country/Area`. Read the sheet names before assuming a transform still works.

### Check the pins are alive before you start

```bash
RUN_NETWORK_TESTS=1 uv run python -m pytest tests/python/test_source_liveness.py -v
```

Range-GETs every pinned file download and fails on a dead URL. Skipped by default, because it is the only test here that uses the network. A `403`/`429` is reported as a skip, not a pass — EI sits behind Cloudflare and can only be checked by hand. Run this **before** a refresh: the GEM breakage above went unnoticed for ~2.5 months because `public/data/` is committed, so the deployed site stayed healthy while the ingest path was broken.

### GEM pipeline route geometry (continuous)

`GlobalEnergyMonitor/goit-ggit-pipeline-routes` on GitHub is, per its own README, "the source of truth for route geometry" for both pipeline trackers, and the only GEM pipeline source still publicly maintained. **Geometry only** — capacity, status, country, operator and start year still come from the tracker snapshots in `data/raw/gem_{oil,gas}_infra/`. `build_pipelines` joins them on `pipeline_id` (GEM's ProjectID, `P0001`).

- The ingest pulls the whole repo as one tarball (~66 MB) and extracts `data/individual-routes/{gas,liquid}-pipelines/*.geojson`; hydrogen is out of scope. 6,495 files, of which 5,205 carry real geometry — GEM writes a file for *every* project, using `"geometry": null` where there is no route to draw, and those fall back to the snapshot geometry rather than blanking the pipeline.
- It is a moving branch, so `release`/`as_of` are the retrieval date. Re-running the ingest with `--force` and bumping both is the whole refresh.
- Current coverage: 96% of oil rows, 97% of gas.
- **Coordinate precision matters here.** The route repo stores far more decimal places than the old CDN snapshots. Writing them verbatim cost 35% more bytes for ~5% more vertices, so the sidecar is written at `COORDINATE_PRECISION=6` (~0.11 m, still ~4,500x finer than the 500 m simplification). Dropping to 5 saves another ~500 KB if the budget needs it.

### LNG-T3 (per Zenodo version)
- Check the concept DOI (`extra["concept_doi"]`) for a newer version. Pin its record id in `LNG_T3_RECORD_ID`, `release` (the label becomes the raw directory and every row's `source_version`), `as_of` (publication date) and the per-CSV `md5:` values from `https://zenodo.org/api/records/<id>`.
- After the ingest, compare checksums: `md5 data/raw/lng_t3/<release>/*.csv` must match the pin.
- `build_lng_voyages` asserts every voyage terminal resolves to an LNG terminal row (the name is the join key) — a renamed terminal fails the build loudly; fix the name map, not the assertion.

### NETL GOGI (ad hoc)
- NETL serves live layers with no versions. Re-ingest when you want newer data, then set `NETL.release` and `NETL.as_of` to the retrieval date (the ingest stamps `_fetched_at` in each raw GeoJSON). Expect small count changes in basins, storage, ports and refineries.
- Refinery dedup (`build_refineries`) is sensitive to NETL's duplicate listings; check `test_no_two_netl_refineries_within_1km_same_country`.
- Storage is filtered to bulk-storage records (`build_storage.is_bulk_storage` drops EPA cleanup sites, SPCC plans, a state master list and transfer points). A NETL re-ingest can add new source categories; watch the transform's kept/dropped counts before accepting a large row-count move.

### UN Comtrade (monthly, backfills)

```bash
set -a; . ~/.config/secrets.env; set +a          # COMTRADE_API_KEY
uv run python -m scripts.ingest.comtrade_monthly --to $(date -v-3m +%Y%m)
uv run python -m scripts.build_all
```

- One call per (period, commodity), ~50 s each, one JSON per call so an interrupted run resumes. Asking for both commodities at once took 213 s; three periods at once returned 500.
- **Comtrade backfills.** A month arrives thin and fills in over roughly six months: mature months carry 68–78 reporters, 2026-08 carried one. `build_comtrade_monthly` drops months below `MIN_REPORTERS` (50) and prints what it dropped, and every surviving row carries its month's `reporters_in_month`. Re-running later picks up the backfill — use `--force` for months you already have.
- **Two aggregation traps, both silent.** Comtrade returns each (reporter, partner) pair several times over, partitioned by customs procedure, mode of transport and second partner, *plus* a totals row; and 31 % of rows are `partnerCode == 0`, the reporter's world total. Summing either inflates everything — Germany's 2025 crude imports came out at $319bn against BACI's $42bn for 2024 before the fix. The transform keeps only `customsCode == "C00"`, `motCode == 0`, `partner2Code == 0`, and drops partner 0.
- **Sanity-check against BACI after any refresh.** Per-country ratios should sit near 0.8–1.0. A ratio of 3 or 8 means a partition filter has stopped working, and nothing else will tell you.
- Country codes are M49 numerics with the ISO fields null; the transform reuses BACI's shipped `country_codes_V*.csv` map rather than duplicating one.
- Free keys are regenerated ad hoc and deactivated if the account goes unused, so a failing refresh may just need a new key from https://comtradedeveloper.un.org/.

### GIE AGSI + ALSI (daily)

A rolling daily feed, so there is no "release" — the pin is the last gas day ingested, and a refresh is just re-running with a later `--to`.

```bash
set -a; . ~/.config/secrets.env; set +a          # GIE_API_KEY
uv run python -m scripts.ingest.gie_daily --to $(date +%F) --force
uv run python -m scripts.build_all --only build_gie_daily && uv run python -m scripts.build_all --from build_catalog
```

- Raw lands as one JSON per (dataset, country) under `data/raw/gie/{agsi,alsi}/`, so a mid-way failure resumes instead of restarting; `--force` is what re-fetches countries already on disk. ~48 calls, throttled with backoff.
- **Country level only, on purpose.** ALSI also publishes per-facility series, but its 41 facility names join to our LNG terminal names for only ~71 % after normalisation, and the near-misses are the dangerous kind ("Rovigo LNG Terminal" vs "Adriatic LNG", "Isle of Grain" vs "Grain LNG"). Terminal-level needs a hand-checked name map. Country codes are unambiguous.
- `"-"` means "does not apply here", not zero: every ALSI field is `"-"` for landlocked countries. The transform emits no row rather than a zero, because a zero would assert Austria sent out no LNG on a day it has no terminals at all.
- **Storage fullness legitimately exceeds 100 %** — 2.8 % of rows, e.g. Belgium at 118 % through the 2022 gas crisis. It is `gasInStorage / workingGasVolume` and operators can hold more than nominal working volume. Verified against the components; do not clamp it, and do not build a colour ramp that assumes a 0–100 domain.
- Licence is free-with-registration, not an open licence, so the file is **view-only** in the catalog.

### EIA STEO shale regions (monthly release)

```bash
set -a; . ~/.config/secrets.env; set +a          # EIA_API_KEY (falls back to the shared DEMO_KEY)
uv run python -m scripts.ingest.eia_steo --force
uv run python -m scripts.build_all --only build_shale_regions && uv run python -m scripts.build_all --from build_catalog
```

- Bump `EIA_STEO.release` / `as_of` to the STEO release date (top of https://www.eia.gov/outlooks/steo/).
- **Bump `history_through_year` in January.** STEO puts forecasts in the same series as history; the transform keeps years up to that pin and fails if a series stops short of it. A September 2026 release forecasts 2026, so the pin is 2025.
- One API request fetches all ten series. The DEMO_KEY fallback allows only a few calls an hour, and exploratory calls count against it — register a key.
- The DPR county list and Census counties are static (`EIA_DPR_COUNTIES`, `CENSUS_COUNTIES`); refetch only if EIA publishes a STEO county list, which would replace the DPR one. Both are archived in R2 under `eia_steo/` (see above) — the DPR workbook belongs to a discontinued product.

### NETL GOGI (ad hoc, live layers)

NETL serves live unversioned layers, so "is there a new release?" has no answer from the landing page. Ask the server for feature counts instead, and only re-ingest if they moved — a full re-snapshot is ~81 MB and restamps `source_version` on every NETL row:

```bash
uv run python - <<'EOF'
import json, urllib.request
from scripts.ingest.netl_gogi import LAYERS, out_path
from scripts.common.netl import NETL_BASE
for key, (server, _) in LAYERS.items():
    url = f"{NETL_BASE}/{server}/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json"
    n = json.load(urllib.request.urlopen(url, timeout=90)).get("count")
    local = len(json.load(open(out_path(key)))["features"])
    print(f"{key:<12} upstream={n:<8} local={local:<8} {'CHANGED' if n != local else ''}")
EOF
```

Counts matching is not proof the attributes are identical, but a change in them is the only cheap signal NETL gives. Checked 2026-09-17: basins 1046, ports 3702, refineries 2272, storage 26103 — all unchanged since the 2026-05-17 snapshot, so the pin was left alone.

If you do re-ingest: the storage layer needs the EPA non-storage filter to still select correctly (it took storage 26,102 → 7,733), and the refinery within-source dedup counts will move.

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

## Scheduled refresh

Automated monthly refresh of free data sources via `launchd`. The script (`scripts/refresh/monthly.sh`) ingests GIE AGSI/ALSI, UN Comtrade, and EIA STEO, rebuilds `public/data/`, and opens a PR — never pushes `main`.

### What it automates

- **GIE AGSI + ALSI:** EU gas storage and LNG send-out (daily, live layers)
- **UN Comtrade:** Crude + LNG imports (monthly, backfills)
- **EIA STEO:** US shale-region production (annual, monthly releases)

Each ingest runs as documented in the per-source sections above; the script reads API keys from `~/.config/secrets.env` and fails clearly if they are missing.

### What it deliberately does NOT automate

- **Annual pin bumps:** EI Statistical Review (`history_through_year` in January; reserves frozen check), BACI release + download URL, GEM GOGET/GGIT tracker releases (form-gated).
- **PR merging:** the script opens a PR and stops. A human reviews the data diff, runs spot checks, and merges.
- **Pushing main:** the refresh branch never reaches `main` through git. The maintainer merges and deploys manually via `vercel --prod`.

### Install and run

1. Copy the plist template to `~/Library/LaunchAgents/`:
   ```bash
   cp scripts/refresh/space.marain.energymap.refresh.plist \
      ~/Library/LaunchAgents/space.marain.energymap.refresh.plist
   ```

2. Install with `launchctl`:
   ```bash
   launchctl load ~/Library/LaunchAgents/space.marain.energymap.refresh.plist
   ```

3. The job runs monthly on the 5th at 9:30 AM local time. To run it manually:
   ```bash
   launchctl start space.marain.energymap.refresh
   # or directly:
   scripts/refresh/monthly.sh
   ```

4. To uninstall:
   ```bash
   launchctl unload ~/Library/LaunchAgents/space.marain.energymap.refresh.plist
   rm ~/Library/LaunchAgents/space.marain.energymap.refresh.plist
   ```

### Logs and status

The script logs to `~/Library/Logs/global-energy-map/`:
- `refresh.log` — stdout (normal execution)
- `refresh.err` — stderr (errors)
- `refresh-status.json` — last run status (ok/failed, timestamp, step)

Dry-run mode (check steps without network/git writes):
```bash
scripts/refresh/monthly.sh --dry-run
```

Health check (for monitoring; exits non-zero if last run failed or is >40 days old):
```bash
scripts/refresh/healthcheck.sh
```

### Pin bumps (manual steps)

When a new release arrives for an annual source, edit `scripts/common/sources.py`:

- **EIA STEO:** After each EIA release (monthly), bump `EIA_STEO.release` and `as_of`. In January, bump `history_through_year` to the new year.
- **EI Statistical Review:** After each annual release (~June), bump `EI.release`, `as_of`, and `download_url`. Check whether reserves were updated (still 2020 as of the 2026 edition); if so, update `test_reserves_end_2020_and_non_negative` in `tests/python/test_source_liveness.py`.
- **BACI:** After the annual release (~January), bump `BACI.release`, `as_of`, and re-derive the constants in `scripts/ingest/baci.py` from the new archive's central directory.
- **GEM GOGET/GGIT:** When a new tracker release is announced, download the tracker file, update `GEM_GOGET`/`GEM_GGIT` pin with the Wayback URL or GitHub tarball release, and bump `release` and `as_of`.

After updating pins, run:
```bash
uv run python -m scripts.build_all [--ingest]  # optionally re-download
```

Then follow the "Checks after a refresh" section above.
