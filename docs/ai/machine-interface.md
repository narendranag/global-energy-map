# Machine interface: using the Global Energy Map from agents and LLMs

The site has no API server, and doesn't need one. Everything an agent needs is available as plain files and URL parameters:

- a **view** is fully described by URL parameters, so an agent can construct links that open exactly the map a human should see;
- the **catalog** is JSON listing every data file, with its licence, rows, size and sha256;
- the **data** is Parquet and GeoJSON over HTTPS with range requests, readable from DuckDB, pandas, polars or any Arrow client.

Base URL: **https://energymap.marain.space** (the old `global-energy-map-one.vercel.app` 308-redirects here, keeping path and query).

## 1. Building links to a view

`https://energymap.marain.space/?<params>`

| Param | Values | Default | Notes |
|---|---|---|---|
| `mode` | `infrastructure` \| `flows` \| `scenarios` | `infrastructure` | A preset. It only fills in what the other params leave out, so explicit params always win. |
| `year` | integer 1990–2024 | 2020 | Clamped into range. Reserves are frozen at their 2020 value for later years; trade data starts in 1995; LNG voyages cover 2020–2024. |
| `commodity` | `oil` \| `gas` | `oil` | Selects the reserves metric and the trade product (HS 2709 crude / HS 271111 LNG). |
| `scenario` | `hormuz` \| `druzhba` \| `btc` \| `cpc` | none | Hormuz works for both commodities (LNG uses LNG-specific shares). Druzhba, BTC and CPC are oil only. |
| `layers` | comma list of `reserves`, `basins`, `extraction`, `pipelines`, `refineries`, `storage`, `ports`, `gas_pipelines`, `lng_terminals`, `lng_voyages` | the mode's preset | `pipelines` is the oil network, including NGL lines. Storage and ports only draw from zoom 4. |
| `lon`, `lat` | decimal degrees | 40, 25 | Map centre. |
| `z` | 0–8 | 2 | Zoom, clamped to 8. |

Examples:

```text
# Central European exposure to a Druzhba cut, 2022
https://energymap.marain.space/?mode=scenarios&scenario=druzhba&commodity=oil&year=2022&layers=reserves,pipelines,refineries&lon=20&lat=50&z=3.5

# Hormuz closure, LNG, 2023
https://energymap.marain.space/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023

# LNG voyages from Qatar's side of the Gulf, 2023
https://energymap.marain.space/?mode=flows&commodity=gas&year=2023&layers=gas_pipelines,lng_terminals,lng_voyages&lon=51&lat=25&z=4
```

The page is rendered client-side, so a crawler fetching the HTML will not see scenario numbers. To get numbers, read the data (section 3) and reproduce the method (section 4). Don't scrape the rendered page.

Other pages: `/methodology` (current-state method, coverage, citations table) and `/data` (every file with licence, rows, size, sha256 and download links).

## 2. The catalog

`https://energymap.marain.space/data/catalog.json` has one entry per (source, file) pair. Fields:

| Field | Meaning |
|---|---|
| `id`, `label` | Stable identifier and human label. |
| `path` | `/data/<file>` on the site. |
| `format` | `parquet` \| `geojson`. |
| `source_name`, `source_url`, `license`, `as_of`, `attribution` | Provenance. `attribution` is the exact credit line to reproduce. |
| `layers` | Which map layers and scenarios read the file. |
| `runtime` | False for artefacts shipped for reproducibility that the app doesn't read. |
| `redistributable`, `downloadable`, `download_note` | Licensing policy. `downloadable` is true only if **every** source sharing the file permits redistribution. `download_note` says why not, when false. |
| `rows`, `bytes`, `sha256` | Integrity. Verify a download against `sha256`. |

Files that appear under several entries (e.g. `assets.parquet` holds seven sources) are downloadable only if all of them are.

## 3. Reading the data

Downloadable (openly licensed) files, with row counts as of this build:

| File | Rows | Licence | Contents |
|---|---|---|---|
| `trade_flow.parquet` | 53,727 | Etalab Open Licence 2.0 (CEPII BACI) | `year, importer_iso3, exporter_iso3, hs_code, value_usd, qty (tonnes), qty_unit, source, qty_reported, qty_imputed`; HS 2709 + 271111, 1995–2024. `qty` is BACI's quantity except where its implied unit value was implausible (> 5× off the year's median); those rows carry `qty_imputed = true` with BACI's figure in `qty_reported` |
| `disruption_route.parquet` | 18 | project-derived, per-row citations | `disruption_id, kind, exporter_iso3, importer_iso3 (null = all), share, source_title, source_url, source_year, source_note`; `hormuz_lng` rows are used on the gas axis |
| `assets_open.parquet` | 36,191 | CC BY 4.0 (GEM, LNG-T3) + public domain (NETL) | `asset_id, kind, name, country_iso3, lon, lat, capacity, capacity_unit, operator, status, commissioned_year, …`; kinds: `extraction_site, refinery, lng_export, lng_import, storage, port` |
| `lng_voyage.parquet` | 17,592 | CC BY 4.0 (LNG-T3) | AIS-derived voyages 2020–2024: dates, IMO, from/to terminal and country, `amount_cbm`, `confidence_score` |
| `lng_trade_daily.parquet`, `lng_terminal_daily.parquet` | 16,691 / 16,115 | CC BY 4.0 (LNG-T3) | daily aggregates |
| `pipelines.geojson` | 3,957 features | CC BY 4.0 (GEM) | oil, NGL and gas pipelines, simplified to about 500 m |
| `basins.geojson` | 1,046 features | public domain (NETL) | basin polygons, simplified |
| `countries.geojson` | | public domain (Natural Earth 1:110m) | country polygons with `iso3` |

View-only files: shown in the app but **not** licensed for bulk redistribution by this project.

- `country_year_series.parquet`: Energy Institute reserves and production.
- `assets.parquet`: includes 88 ODbL OpenStreetMap rows; use `assets_open.parquet` instead.

An agent may read these to answer a question with attribution, but must not republish them in bulk. Check `downloadable` in the catalog rather than hard-coding this list.

DuckDB (CLI or Python) reads the files straight over HTTPS:

```sql
INSTALL httpfs; LOAD httpfs;

-- Top crude importers from Saudi Arabia, 2023 (tonnes)
SELECT importer_iso3, round(sum(qty)) AS tonnes
FROM read_parquet('https://energymap.marain.space/data/trade_flow.parquet')
WHERE exporter_iso3 = 'SAU' AND hs_code = '2709' AND year = 2023
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

-- Route shares behind the Druzhba scenario, with citations
SELECT exporter_iso3, importer_iso3, share, source_title, source_year
FROM read_parquet('https://energymap.marain.space/data/disruption_route.parquet')
WHERE disruption_id = 'druzhba';
```

pandas:

```python
import pandas as pd
trade = pd.read_parquet("https://energymap.marain.space/data/trade_flow.parquet")
assets = pd.read_parquet("https://energymap.marain.space/data/assets_open.parquet")
```

Runtime URLs inside the app carry `?v=<first 8 hex of sha256>` for cache-busting. Plain paths without `?v=` also work and always return the current bytes.

## 4. Reproducing a scenario number

The engine is a small pure function (`src/lib/scenarios/engine.ts`). For scenario *s*, year *y* and commodity *c*:

1. Take BACI flows for *y* and product *c* (HS 2709 for oil, HS 271111 for gas).
2. For each flow exporter → importer, look up the route share: the per-pair row if one exists, otherwise the exporter-wide row (`importer_iso3` null), otherwise 0. For Hormuz on the gas axis, use the `hormuz_lng` rows.
3. For each importer, `share_at_risk = Σ(qty × share) / Σ qty`.
4. The app shades and ranks only importers with at least 0.1 % of world imports in that year.

This is exposure accounting, not a market model: no price response, rerouting, stocks or substitution. See [the researcher scenario method](../researchers/scenario-method.md) and `/methodology`.

## 5. Citing and attribution rules an agent must follow

- **Cite the map:** Nag, N. (2026). *Global Energy Map* (Version 1.0.0) [Computer software]. https://energymap.marain.space. `CITATION.cff` and the Share → Cite menu give APA and BibTeX.
- **Cite the sources behind any number:** use each catalog entry's `attribution` line. GEM and LNG-T3 (CC BY 4.0) require visible attribution. BACI asks for Gaulier & Zignago (2010).
- **Respect `downloadable`.** Don't redistribute view-only files.
- **Carry the caveats with the numbers:**
  - reserves frozen at 2020;
  - BACI suppresses Iran's exports in 2023–24;
  - LNG-T3 covers 22–41 % of global LNG trade;
  - route shares are static across years.

Full terms: [`LICENSE-DATA.md`](../../LICENSE-DATA.md).

## 6. Stability

- URL parameters, catalog fields, file paths and the column names listed above are treated as a public interface. New optional params and fields may be added. Breaking changes will keep redirects or aliases, and will be noted in `docs/refresh.md`'s data changelog.
- Data refreshes follow [`docs/refresh.md`](../refresh.md). The catalog's `as_of` and `sha256` change when data changes.
- Report problems at https://github.com/narendranag/global-energy-map/issues.
