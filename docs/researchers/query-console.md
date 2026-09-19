# Query console

<https://energymap.marain.space/query>

The map answers the questions it was designed around. The console answers the rest: it runs **SQL over the same Parquet files the map reads**, so you can compute a number the interface does not offer, check one it does, or extract exactly the rows you need.

It runs [DuckDB](https://duckdb.org) compiled to WebAssembly **inside your browser**. There is no query server. The engine (about 7 MB, once per browser) and the data files come from the site, your SQL is executed on your machine, and nothing about it is sent anywhere or logged. You can work offline once the page and its tables have loaded.

## What you can query

One table per Parquet file the site ships, named after the file. The sidebar beside the editor lists each one with its columns and types, row count, source, licence and whether results that read it may be saved as a file. It is generated from `catalog.json`, so it can never drift from what is actually registered.

| Table | Rows | What it holds |
|---|---|---|
| `trade_flow` | 53,727 | BACI bilateral crude (HS 2709) and LNG (HS 271111) trade, 1995–2024, in tonnes |
| `disruption_route` | 72 | the scenario route shares, one row per exporter (or exporter–importer pair), each with its citation |
| `lng_voyage` | 17,592 | LNG-T3 voyages 2020–2024: dates, IMO, terminals, cargo, confidence |
| `lng_trade_daily`, `lng_terminal_daily` | 16,691 / 16,115 | the same source aggregated by country pair and by terminal |
| `assets` | 19,960 | extraction sites, refineries, storage, ports and LNG terminals (view-only: it mixes in OpenStreetMap rows) |
| `assets_open` | 19,871 | the same table without the OpenStreetMap rows — this one is downloadable |
| `country_year_series` | 4,836 | Energy Institute reserves and crude production by country and year (view-only) |
| `gie_daily` | 188,767 | European gas storage and LNG send-out, daily from 2020 (view-only) |
| `comtrade_monthly` | 8,839 | UN Comtrade monthly crude and LNG imports (view-only) |
| `shale_region_year` | 170 | EIA US shale-region crude and gas production, 2009 onward |

Map geometry — pipelines, basins, country outlines — ships as GeoJSON, not Parquet, and is not queryable here.

Only the tables a query names are downloaded, so a query over `trade_flow` (844 KB) does not pull in anything else.

## What you can save

**Every table can be read on screen; not every result can be saved as a file.** The map already displays all of these rows, so reading them is nothing new — but a CSV is redistribution, and some sources are free to show and not free to redistribute.

So **Download CSV** is offered only when *every* table the query reads is openly licensed (CC BY 4.0, public domain, or CEPII BACI under the Etalab Open Licence), exactly as on the [Data page](https://energymap.marain.space/data). A join that pulls in a view-only table blocks the download and says which table did it, with that table's own reason. This is stricter than "what the map shows", deliberately: a join produces a new derived table, and should not be able to launder a view-only source through an openly licensed one.

Which tables a query reads is decided from **DuckDB's own parse tree**, not by pattern-matching the text, so quoted identifiers, CTEs, subqueries, set operations and a direct `read_parquet('/data/…')` call are all read correctly. Anything the check cannot prove — a second statement, another table function, a non-SELECT — refuses the download rather than guessing.

An exported CSV begins with `#` comment lines giving the query and citing every source it read, with licences and as-of dates. `pandas.read_csv(path, comment="#")` and `read.csv(path, comment.char = "#")` skip them.

## Sharing a query

Your SQL is written into the address bar, so the page URL is a link to the query. Paste it into a paper, an issue or a message and the recipient opens the console with it loaded. Very long queries are not written to the URL; the editor still holds them.

## Examples

Six starting points sit under the editor, each drawn from the [worked examples](worked-examples.md) and each verified against the shipped data:

1. **Largest crude importers, 2024** — the denominator every scenario percentage uses.
2. **Crude at risk if Hormuz closes, 2024** — reproduces the scenario panel, pair shares overriding the exporter-wide row. Compare with [worked example 2](worked-examples.md#2-who-loses-most-if-hormuz-closes-2024-crude).
3. **Central Europe's Druzhba exposure, 2022** — [worked example 1](worked-examples.md#1-how-exposed-is-central-europe-to-a-druzhba-cut-2022).
4. **Where Qatar's LNG went in 2023** — observed voyages beside recorded trade, [worked example 5](worked-examples.md#5-where-did-qatars-lng-go-in-2023).
5. **Permian production since 2009** — EIA history only.
6. **European gas storage, winter 2025** — deliberately view-only, so you can see the licence gate refuse an export.

The scenario engine itself is not reimplemented in SQL. Its refinery and LNG-terminal attribution and its in-service rules live in `src/lib/scenarios/` as pure functions, and duplicating them here would only create two answers that could drift apart. The example queries cover the parts that *are* plain SQL — which is enough to check the country-level numbers the panel reports.

## Caveats

- The same ones as the rest of the site. A query cannot repair BACI's gaps, LNG-T3's partial coverage or the missing reserves after 2020; read [Data and coverage](data-and-coverage.md) before trusting a number.
- Results are capped: the row limit you choose (up to 5,000) bounds what DuckDB returns, and the page draws the first 500 of them. Both are stated on screen, and the CSV holds the full limited result.
- The tables are a snapshot. When the data are refreshed, the same query returns different numbers — cite the file hashes from the [Data page](https://energymap.marain.space/data) alongside the query if that matters.
