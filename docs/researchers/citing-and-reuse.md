# Citing and reuse

How to cite the map and a specific view, how to credit the underlying sources, what you may download and under which licence, how to verify a file, and how to rebuild the data yourself. The licence summary here follows [`LICENSE-DATA.md`](../../LICENSE-DATA.md), which is the authoritative plain-language statement (and not legal advice).

## Citing the map

The citation metadata live in [`CITATION.cff`](../../CITATION.cff) (version 1.0.0, released 2026-09-09). GitHub's "Cite this repository" button reads the same file.

**APA 7**

> Nag, N. (2026). *Global Energy Map* (Version 1.0.0) [Computer software]. https://energymap.marain.space

**BibTeX** (biblatex `@software`; tools without it treat it as `@misc`)

```bibtex
@software{nag2026global,
  author  = {Nag, Narendra},
  title   = {{Global Energy Map}},
  year    = {2026},
  version = {1.0.0},
  url     = {https://energymap.marain.space}
}
```

The code repository is <https://github.com/narendranag/global-energy-map> (MIT licence). The map has no DOI at present.

## Citing a specific view

Because the map is interactive, cite the **view** you are describing, with the date you accessed it. On the map, open **Share / cite → Cite this view**:

- **View + sources** (the default) gives an APA reference whose URL is the exact view and which says "Retrieved *date*, from *URL*", followed by a one-line summary (year · commodity · scenario), the visible layers, every source behind them with its as-of date and licence, and the required attribution lines. Paste it into a figure caption, footnote or data appendix.
- **APA** and **BibTeX** give the reference alone. The BibTeX version adds `urldate` and a `note` pointing to the project home.

An example of the reference line for a view:

> Nag, N. (2026). *Global Energy Map* (Version 1.0.0) [Computer software]. Retrieved September 11, 2026, from https://energymap.marain.space/?mode=scenarios&year=2024&commodity=oil&scenario=hormuz&layers=reserves,pipelines,refineries,lng_terminals&lon=80&lat=22&z=2.5

For figures you publish, also state the scenario, year and commodity in the caption, and — for scenario numbers — attach or archive the **scenario table** CSV (below), because the URL reproduces the view but not a frozen copy of the data.

## Citing the underlying sources

Cite the original publishers as well as the map; several licences require it. The attribution lines the map uses (from the catalogue, also shown on [/data](https://energymap.marain.space/data) and [/methodology](https://energymap.marain.space/methodology#required-attributions)):

| Source | Attribution line | Also cite |
|---|---|---|
| Global Energy Monitor (extraction sites, pipelines, 7 LNG terminals) | Data: Global Energy Monitor, CC BY 4.0 | the tracker and release (GOGET July 2023; GOIT 2025-04-09; GGIT 2026-02-20) |
| LNG-T3 (LNG terminals, voyages, daily tables) | Data: Zhou, C. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058), CC BY 4.0 | the dataset DOI |
| NETL GOGI (basins, storage, ports, refineries) | Data: NETL Global Oil & Gas Infrastructure (GOGI), US DOE | Sabbatino et al., doi:10.18141/1427300 |
| Energy Institute (reserves, production) | Data: Energy Institute Statistical Review of World Energy 2025 | — |
| CEPII BACI (scenario trade) | Data: CEPII BACI (release V202601); cite Gaulier & Zignago (2010) | Gaulier, G. & Zignago, S. (2010), *BACI: International Trade Database at the Product-Level. The 1994–2007 Version*, CEPII Working Paper 2010-23 |
| OpenStreetMap (88 refineries) | © OpenStreetMap contributors, ODbL | — |
| Route shares | cite this project and the document on each row | the documents in the *Route shares used* list |
| Basemap | Basemap: OpenFreeMap © OpenMapTiles, data from OpenStreetMap contributors | — |

CC BY 4.0 also asks you to **indicate changes**: the data you get from the map have been filtered, re-keyed to ISO3, harmonised in units, deduplicated and (for geometry) simplified. [`LICENSE-DATA.md`](../../LICENSE-DATA.md) lists the changes per source; saying "as processed by the Global Energy Map (Nag 2026)" with a link to it is sufficient notice.

## What you can download

The rule (from [`LICENSE-DATA.md`](../../LICENSE-DATA.md)): a file is offered only when **every** row in it is CC BY 4.0, public domain, openly licensed for redistribution, or the project's own derived table. The catalogue's `downloadable` field records the result; [/data](https://energymap.marain.space/data) shows a **Download** button exactly where it is true.

| File | Contents | Licence | Downloadable |
|---|---|---|---|
| `assets_open.parquet` | 36,191 asset rows: extraction sites, refineries (NETL only), storage, ports, LNG terminals, with a `source` column | CC BY 4.0 (GEM, LNG-T3) + public domain (NETL); attribution required | Yes |
| `pipelines.geojson` | oil and gas pipelines, simplified | CC BY 4.0 | Yes |
| `basins.geojson` | basin polygons, simplified | public domain (credit NETL) | Yes |
| `lng_voyage.parquet`, `lng_trade_daily.parquet`, `lng_terminal_daily.parquet` | LNG-T3 voyages and daily tables, 2020–2024 | CC BY 4.0 | Yes |
| `trade_flow.parquet` | BACI HS 2709 + 271111 extract, 1995–2024, with the quantity repair | Etalab Open Licence 2.0 | Yes |
| `disruption_route.parquet` | the 18 route shares with citations | project table; cite project and sources | Yes |
| `countries.geojson` | Natural Earth 1:110m | public domain | Yes |
| `assets.parquet` | the map's asset table, incl. 88 OSM refineries | mixed, includes ODbL | **No** — use `assets_open.parquet` |
| `country_year_series.parquet` | EI reserves and production | EI terms | **No** — get it from the Energy Institute |

From the map, **Share / cite → Download** also exports:

- each visible layer whose sources are all redistributable, as **CSV or GeoJSON**, filtered to the selected year, with source, licence and as-of date in the file header (reserves and refineries are view-only);
- the **scenario table** (CSV): every importer with imports, plus refinery or LNG-terminal rows, in tonnes, marked as *derived analysis*, with a header that cites BACI, the route shares row by row, and (for LNG 2020–2024) LNG-T3.

For OpenStreetMap refineries, query OpenStreetMap directly and share any derivative under the ODbL. For the Energy Institute series, download the workbook from the EI.

## Verifying a download

Every file on [/data](https://energymap.marain.space/data) is listed with its size and **sha256**; the values come from `public/data/catalog.json`, which the build generates and CI checks against the shipped bytes. To verify:

```bash
curl -sO https://energymap.marain.space/data/trade_flow.parquet
shasum -a 256 trade_flow.parquet      # Linux: sha256sum trade_flow.parquet
```

Compare the output with the hash on /data (the **Copy** button next to each hash copies it in full). A mismatch means you have a different release, not a corrupted page: check the as-of date and the [data changelog](../refresh.md#data-changelog).

## Reproducing the data build

Every shipped file is built by Python scripts from public inputs. With [uv](https://docs.astral.sh/uv/) installed:

```bash
git clone https://github.com/narendranag/global-energy-map
cd global-energy-map
uv sync                                          # Python dependencies
uv run python -m scripts.build_all --ingest      # download pinned sources, then every transform
uv run python -m scripts.build_all               # later runs: transforms only, no network
uv run python -m pytest tests/python -q          # schema and integrity checks
```

Source URLs and releases are pinned in `scripts/common/sources.py`. The build ends by regenerating `catalog.json` with each file's size and sha256, and rebuilding from the same raw inputs is byte-identical. Three caveats for a fresh clone, all covered in [`docs/refresh.md`](../refresh.md):

- The Energy Institute site blocks scripted downloads; if the ingest fails, save the workbook by hand into `data/raw/ei_statistical_review/`.
- GEM's extraction tracker is behind an email form; the pin points to a public Wayback Machine capture of the July 2023 file.
- NETL GOGI and OpenStreetMap are live services without versions. Re-ingesting them fetches today's data, so the files built from them (`assets.parquet`, `assets_open.parquet`, `basins.geojson`) will not match the published hashes exactly; the versioned sources (BACI, GEM, LNG-T3, EI) should.

## Versions and as-of dates

- **Software version** — `CITATION.cff` (currently 1.0.0).
- **Data version** — each file's **as-of date** and **sha256** on /data. The catalogue as a whole carries a version number (currently 6) and a `generated_at` date equal to the newest source as-of date.
- **What changed** — the dated [data changelog](../refresh.md#data-changelog) in the refresh runbook. Sources are refreshed by hand, at each publisher's cadence (EI annually around June; BACI annually around January–February; GEM, LNG-T3 and NETL per release or ad hoc; OpenStreetMap quarterly).

A view URL records the *view*, not the *data*. If you report numbers, record the access date and, ideally, the sha256 of `trade_flow.parquet` (for scenarios) or keep the exported CSV alongside your analysis.

## Questions and corrections

Licence questions, attribution errors or data problems: open an issue at <https://github.com/narendranag/global-energy-map/issues>.
