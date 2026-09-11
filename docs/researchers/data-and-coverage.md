# Data and coverage

Layer by layer: where the data come from, how current and complete they are, what units they use, how they behave on the year control, and which gaps or biases matter for analysis. Counts are from the files in `public/data/` (catalogue version 6). For the file-level record — licence, rows, size, sha256 — see [/data](https://energymap.marain.space/data); for the full methodology, [Methodology](../methodology.md); for the source inventory and rejected alternatives, [Data sources](../data-sources.md).

## At a glance

| Layer | Source | As of | Rows | Year behaviour | Units |
|---|---|---|---|---|---|
| Reserves | Energy Institute Statistical Review, 2025 edition | 2025-06-26 | oil 49 countries, gas 51 | 1990–2020; 2020 value after | bn bbl · Tcm |
| Basins | NETL GOGI | 2026-05-17 | 1,046 | static | km² |
| Extraction sites | GEM GOGET | 2023-07 | 5,008 | 22 % dated | none (no capacity) |
| Oil pipelines | GEM GOIT | 2025-04-09 | 1,185 | 64 % dated | kb/d |
| Gas pipelines | GEM GGIT | 2026-02-20 | 2,772 | 74 % dated | bcm/y |
| Refineries | NETL GOGI + OpenStreetMap | 2026-05-17 / 2026-05-15 | 1,163 | static | kb/d |
| Storage | NETL GOGI | 2026-05-17 | 26,102 | static | (barrels, 4 rows) |
| Ports | NETL GOGI | 2026-05-17 | 3,694 | static | — |
| LNG terminals | LNG-T3 + GEM GGIT | 2026-04-01 / 2026-02-20 | 312 | 98 % dated | Mtpa |
| LNG voyages | LNG-T3 | 2026-04-01 | 17,592 | 2020–2024 only | m³ of LNG |
| Scenario trade | CEPII BACI HS92, V202601 | 2026-01 | 53,727 pair-years | 1995–2024 | tonnes (+ USD) |
| Route shares | EIA / IEA / Argus (Kpler) / GEM | 2026-09-10 | 18 | static | fraction |
| Country polygons | Natural Earth 1:110m | 2024-10-01 | 177 | static | — |

"Dated" means the row carries a start or commissioning year; undated rows are drawn in **every** year.

## Layer by layer

### Reserves (country choropleth)

- **Source:** Energy Institute *Statistical Review of World Energy* 2025, proved-reserves history sheets. The same file (`country_year_series.parquet`) holds crude production, 1990–2024, for 50 countries (used in tooltips).
- **Coverage:** proved oil reserves for 49 countries and gas reserves for 51, 1990–2020. The EI publishes smaller producers only inside regional "Other …" totals, which are not attributed to any country; such countries get the grey no-data tint.
- **Time:** reserves stop in 2020. For 2021–2024 the map shows the 2020 value and says so.
- **Display:** logarithmic colour scale.
- **Reuse:** view-only (EI permission needed for extensive reproduction).

### Basins

- **Source:** US DOE NETL Global Oil & Gas Infrastructure (GOGI), 1,046 basin polygons, simplified to about 1 km for the browser.
- **Gaps:** geological outlines, not producing areas; 272 polygons (26 %) have no name; no time dimension.

### Extraction sites

- **Source:** Global Energy Monitor, Global Oil & Gas Extraction Tracker, July 2023 snapshot (newer releases are behind a sign-up form).
- **Coverage:** 5,008 fields in 67 countries: 4,795 operating, 123 in development, 77 discovered, 13 shut in.
- **Bias:** **54 % of sites (2,719) are in the United States.** Point density is not production density.
- **Time:** commissioning year for 1,087 sites (22 %).
- **Gaps:** no production or capacity values at all.

### Oil and gas pipelines

- **Source:** GEM Global Oil Infrastructure Tracker (2025-04-09) and Global Gas Infrastructure Tracker (2026-02-20).
- **Coverage:** oil 1,185 lines (998 crude, 156 NGL, 31 crude+NGL; 1,137 operating, 48 under construction); gas 2,772 (2,554 operating, 218 under construction). Shelved, cancelled, retired and geometry-less features are dropped at ingest.
- **Units:** oil capacity in kb/d (933 of 1,185 rows); gas capacity in bcm/y (the column is called `capacity_kbpd` for historical reasons; `capacity_unit` says `bcm/y`).
- **Time:** start year for 760 oil lines (64 %) and 2,058 gas lines (74 %). No retirement year.
- **Geometry:** each pipeline's contiguous line fragments are merged, then simplified at 0.005° (about 500 m); the file is about 8 MB. Schematic at street scale; the map stops at zoom 8.

### Refineries

- **Sources:** NETL GOGI (1,075 rows after merging NETL's own duplicate listings within 1 km) plus 88 OpenStreetMap refineries not within 2 km of a NETL one. Each row carries a `source`.
- **Units:** capacity in kb/d, parsed from NETL's free text; **known for 350 of 1,163 (30 %)**, never for OSM rows.
- **Country spread:** USA 163, China 100, Russia 76, Argentina 57, Canada 44 rows.
- **Gaps:** no commissioning or closure years; status mostly defaulted to "operating"; a few probable duplicates with conflicting capacities remain as two rows; some major plants have no capacity (e.g. PCK Schwedt in Germany).
- **Reuse:** the layer is view-only because of the ODbL rows; the NETL rows are in `assets_open.parquet`.

### Storage hubs

- **Source:** NETL GOGI, 26,102 sites; drawn from zoom 4.
- **Bias:** **90 % of rows (23,501) are in the United States**, and 6,025 carry the NETL status "LEAKING UNDERGROUND STORAGE TANK - ARRA" — i.e. a US environmental-programme inventory, not strategic or commercial storage hubs. Read this layer as "where NETL has records", not as a global storage map.
- **Gaps:** capacity on 4 rows; no dates; status blank on most rows.

### Ports

- **Source:** NETL GOGI, 3,694 oil and gas handling ports in 156 countries; drawn from zoom 4.
- **Gaps:** status blank for 93 %; capacity on 23 rows; no dates.

### LNG terminals

- **Sources:** LNG-T3 (Zhou et al. 2026) primary, 305 terminals; GEM GGIT supplement, 7 terminals not matched by name or within 25 km of an LNG-T3 terminal in the same country.
- **Coverage:** 312 terminals in 70 countries — 73 export (59 operating, 14 under construction) and 239 import (191 operating, 48 under construction). Capacity (Mtpa) for 310; commissioning year for 305 (97.8 %).
- **Time:** terminals appear from their commissioning year. **28 terminals have a commissioning year after 2024** and are never drawn (the slider ends at 2024), though the Hormuz-LNG scenario still uses them for capacity-proxy splits.

### LNG voyages

- **Source:** LNG-T3 AIS-derived voyage table: 17,592 voyages (8,645 laden, 8,947 ballast), 2020-01-01 to 2024-12-31.
- **What is drawn:** laden voyages with confidence ≥ 3 of 5 (7,279 in total) that were under way in the selected year. By start year: 1,136 (2020), 1,509, 1,912, 1,946, 776 (2024).
- **Units:** m³ of LNG; tonnes shown at 0.4245 t/m³ for display only.
- **Coverage:** 22–41 % of GIIGNL's reported world LNG trade per year (2020: 0.22, 2021: 0.28, 2022: 0.34, 2023: 0.41, 2024: 0.32). Uneven by route (see [Worked example 5](worked-examples.md#5-where-did-qatars-lng-go-in-2023)). Never used as a country total.
- Two further LNG-T3 tables (`lng_trade_daily.parquet`, 16,691 rows; `lng_terminal_daily.parquet`, 16,115 rows) are shipped for reproducibility and are not drawn.

### Scenario trade (BACI)

- **Source:** CEPII BACI, HS92 release V202601: annual bilateral trade for HS 2709 (crude, 39,740 pair-years) and HS 271111 (LNG, 13,987), 1995–2024, reconciled from UN Comtrade mirror statistics. Columns include `qty` (tonnes), `value_usd`, `qty_reported` and `qty_imputed`.
- **Cleaning:** BACI's non-country aggregates removed; duplicate pairs summed; implausible quantities repaired (below).
- **Gaps:** annual only; about a year's lag; sensitive or unreported flows missing (below).

### Route shares and country polygons

- **Route shares:** 18 hand-set rows with per-row citations; see [Scenario method](scenario-method.md#route-shares).
- **Countries:** Natural Earth 1:110m, 177 polygons. Small islands and city-states (Singapore, Bahrain, Hong Kong, …) have no polygon at this scale: they appear in scenario tables and the *Check a country* box but not as map fills.

## Things that will mislead you

1. **Reserves are frozen at 2020.** Any post-2020 change on the reserves map is a display artefact.
2. **Undated features appear in every year.** In 1995, 60 % of the pipelines drawn have no start year. Early-year maps show too much; retired facilities are mostly absent, so they also show the wrong things.
3. **Capacity is thin outside pipelines and LNG.** Refineries 30 %, ports 23 rows, storage 4 rows, extraction sites none. Rankings "by capacity" silently leave out everything without a number.
4. **Point density reflects source effort, not the energy system.** Storage is 90 % US records; extraction sites are 54 % US.
5. **LNG-T3 is a 22–41 % sample, and an uneven one.** A missing arc or a "no voyages" terminal is a coverage gap, not a zero.
6. **BACI quantities were repaired.** Some BACI quantities are wrong by one to three orders of magnitude while the values are right (e.g. Philippines ← Saudi Arabia crude, 2023: 80.9 Mt reported at 26 USD/t). Any row whose unit value is more than 5× away from the median for its HS code and year is re-estimated as `value_usd ÷ median`; BACI's figure is kept in `qty_reported` and the row is flagged `qty_imputed`. 9,655 of 53,727 rows are affected (6,722 crude, 2,933 LNG; mostly small shipments). Values are never changed. If your own work uses BACI directly, you will see different quantities for those rows. See [Methodology → Trade data](../methodology.md#trade-data-baci).
7. **BACI suppresses Iran.** Iranian crude exports are near zero in 2023–2024 and far below mid-2010s levels from 2019. Exposure of Iran's buyers is understated.
8. **BACI loses Russia → Belarus from 2022.** No Russian crude into Belarus is recorded for 2022–2024, so Druzhba results from 2022 omit Belarus entirely.
9. **BACI starts in 1995.** Scenarios for 1990–1994 have no trade data.
10. **Route shares are static and some routes are younger than the data.** A share applies unchanged to 1995–2024 (see [Scenario method](scenario-method.md#why-route-shares-are-static)).
11. **NETL duplicates are merged, not eliminated.** 2,272 raw NETL refinery rows became 1,075; a few duplicates with conflicting capacities remain.
12. **Geometry is simplified.** Pipelines at about 500 m and basins at about 1 km; country polygons at 1:110m. Do not measure lengths or areas from the map.
13. **The asset table is a present-day snapshot.** Refinery and terminal attribution in a 2005 scenario uses today's refineries and terminals.

For how each source is refreshed and what changed when, see the [refresh runbook and data changelog](../refresh.md).
