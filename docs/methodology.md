# Methodology

This is the **current-state** methodology of Global Energy Map: for every map layer and every disruption scenario, where the data comes from, how current it is, how complete it is, what units it is in, what it cannot tell you, and how the scenarios use it. It describes the site as it is now. The phase-by-phase record of how it got here — including claims that later phases superseded — lives in [`docs/history.md`](https://github.com/narendranag/global-energy-map/blob/main/docs/history.md). The source-by-source research inventory (including sources evaluated and rejected) is [`docs/data-sources.md`](https://github.com/narendranag/global-energy-map/blob/main/docs/data-sources.md). File-level metadata — licence, as-of date, row count, size and sha256 for every shipped file — is on the [Data page](/data).

## At a glance

| Layer | Source | As of | Features | Follows the year slider | Units |
|---|---|---|---|---|---|
| Reserves (country) | Energy Institute Statistical Review | 2025 edition | 1990–2020, country-year | Yes, to 2020; 2020 value shown for 2021–2024 | oil: billion bbl · gas: Tcm |
| Basins | NETL GOGI | 2026-05-17 snapshot | 1,046 polygons | No | area km² |
| Extraction sites | GEM GOGET | 2023-07 | 5,008 | Partly — 22 % dated | — (no capacity) |
| Oil pipelines | GEM GOIT | 2025-04-09 | 1,185 | Partly — 64 % dated | kb/d |
| Gas pipelines | GEM GGIT | 2026-02-20 | 2,772 | Partly — 74 % dated | bcm/y |
| Refineries | NETL GOGI (primary) + OpenStreetMap | 2026-05 | 1,163 (1,075 + 88) | No | kb/d (30 % known) |
| Storage hubs | NETL GOGI | 2026-05-17 | 26,102 | No | — |
| Ports | NETL GOGI | 2026-05-17 | 3,694 | No | — |
| LNG terminals | LNG-T3 (primary) + GEM GGIT | 2026-04-01 / 2026-02-20 | 312 (305 + 7) | Yes — 98 % dated | Mtpa |
| LNG voyages | LNG-T3 | 2026-04-01 | 17,592 voyages, 2020–2024 | Yes, 2020–2024 only | m³ of LNG |
| Scenario trade | CEPII BACI, HS 2709 + 271111 | V202601 | 53,727 country-pair-years, 1995–2024 | Yes | tonnes |
| Scenario route shares | EIA / IEA / Argus (Kpler) / GEM, per row | 2026-09-11 | 18 shares + 54 intra-Gulf share-0 pairs | No — static | fraction |

"Dated" means the feature carries a start or commissioning year. Undated features are shown in every year, so for layers that are only partly dated the map *over*-states what existed in early years.

## Map layers

### Reserves (country choropleth)

- **Source:** Energy Institute, *Statistical Review of World Energy* 2025 — "Oil: Proved reserves history" and "Gas: Proved reserves history" sheets. File `country_year_series.parquet`.
- **Coverage:** proved oil reserves (billion barrels) and proved gas reserves (trillion cubic metres), country-year, **1990–2020**. The same file carries crude production (kb/d) 1990–2024, used in tooltips.
- **Reserves stop in 2020.** The EI edition that refreshed production to 2024 did not update the reserves tables. For 2021–2024 the choropleth shows the **2020 value** and says so on the map ("Reserves: 2020 value"). No post-2020 change in the map is a real change in reserves.
- **Colour scale:** logarithmic, so both Venezuela-scale and small producers are distinguishable. Countries with no reserves row in the source get a neutral no-data tint, not the bottom of the ramp.
- **Gaps:** country aggregates only (no field, basin or sub-national split); EI's regional "Other …" residuals are not attributed to any country.
- **Scenarios:** not used. When a scenario is active the country fill switches from reserves to exposure.
- **Licence:** free to quote with attribution; the Energy Institute asks for permission before extensive reproduction of its tables, so the Data page does not offer the series for download (see [Licences](#licences)).

### Basins

- **Source:** US DOE National Energy Technology Laboratory, Global Oil and Gas Infrastructure (GOGI) — basins feature service, snapshot retrieved 2026-05-17. Public domain (17 USC §105).
- **Coverage:** 1,046 petroleum-bearing basin polygons with name, country, region and area. Geometry is simplified to ≈1 km for the browser (`basins.geojson`); full resolution stays in the build.
- **Gaps:** geological outlines, not production; many polygons lack a name; no time dimension.
- **Scenarios:** not used.

### Extraction sites

- **Source:** Global Energy Monitor, Global Oil & Gas Extraction Tracker (GOGET), July 2023 snapshot. CC BY 4.0.
- **Coverage:** 5,008 oil and gas fields with location, status (4,795 operating, 123 in development, 77 discovered, 13 shut in), operator and country.
- **Time:** `commissioned_year` is known for **1,087 of 5,008 (22 %)**; the other 78 % appear in every year.
- **Gaps:** **no production or capacity** in this snapshot (GEM publishes production in separate sheets with non-uniform units; not ingested). Newer GEM releases are behind a sign-up form.
- **Scenarios:** not used.

### Oil pipelines

- **Source:** Global Energy Monitor, Global Oil Infrastructure Tracker (GOIT), 2025-04-09 GeoJSON release. CC BY 4.0.
- **Coverage:** 1,185 crude, NGL and crude+NGL lines that are operating (1,137) or in construction (48). Shelved, cancelled and retired lines, and features without geometry, are dropped at ingest.
- **Units:** capacity in thousand barrels per day, known for 933 of 1,185.
- **Time:** `start_year` known for 760 of 1,185 (64 %); undated lines appear in every year. There is no retirement year, so a line decommissioned in the past is not in the data at all rather than disappearing at the right year.
- **Geometry:** each pipeline's contiguous line fragments are merged, then simplified at 0.005° (≈500 m); the browser file is about 8 MB and the shape is schematic at street scale.
- **Scenarios:** not used directly — the pipeline scenarios are defined by route shares (below), not by these geometries.

### Gas pipelines

- **Source:** Global Energy Monitor, Global Gas Infrastructure Tracker (GGIT), 2026-02-20 release. CC BY 4.0.
- **Coverage:** 2,772 operating (2,554) or in-construction (218) gas lines, on the same filtering rules as oil.
- **Units:** capacity in billion cubic metres per year (the column is named `capacity_kbpd` for historical reasons; `capacity_unit` says `bcm/y`).
- **Time:** `start_year` known for 2,058 of 2,772 (74 %).
- **Scenarios:** not used. The only gas scenario is Hormuz-LNG, which concerns seaborne LNG, not pipeline gas.

### Refineries

- **Sources:** NETL GOGI Refineries (primary, public domain, snapshot 2026-05-17) plus OpenStreetMap (supplement, ODbL, Overpass snapshot 2026-05-15). Each row carries a `source` column.
- **Deduplication:**
  - *Within NETL* — NETL lists many plants more than once (an English name, a numbered "333 – …" variant, a French "Raffinerie de …" variant). Rows in the same country within **1 km** are merged, but never two rows whose known capacities differ by more than 5 %. 2,272 raw rows become **1,075**. A few probable duplicates with conflicting capacities (e.g. several Pemex plants) remain as two rows.
  - *OSM against NETL* — an OSM refinery is dropped when a NETL refinery in the **same country lies within 2 km**. The 2 km threshold is the knee of the nearest-neighbour distance distribution: matches under 2 km are the same facility; beyond it, genuinely distinct neighbours appear (e.g. Marcus Hook / Trainer). 168 OSM refineries become **88** supplements.
- **Units:** capacity in kb/d, parsed from NETL's free-text field; known for **350 of 1,163 (30 %)**; OSM rows never carry capacity.
- **Time:** no vintage in either source; refineries appear in every year.
- **Scenarios:** oil scenarios attribute each country's at-risk crude imports to its refineries — see [Refinery attribution](#refinery-attribution).
- **Licence:** the 88 OSM rows are ODbL (share-alike), so the refinery layer — and `assets.parquet`, which mixes them with CC BY and public-domain rows — is view-only. The 1,075 NETL refineries are in the downloadable `assets_open.parquet`.

### Storage hubs

- **Source:** NETL GOGI storage feature service, snapshot 2026-05-17. Public domain.
- **Coverage:** 26,102 oil and gas storage sites. Drawn from zoom 4 upward to keep the world view legible.
- **Gaps:** capacity is present on only 4 rows, so the layer shows *where* storage is, not how much; no vintage; status is mostly blank.
- **Scenarios:** not used.

### Ports

- **Source:** NETL GOGI ports feature service, snapshot 2026-05-17. Public domain.
- **Coverage:** 3,694 oil and gas handling ports. Drawn from zoom 4 upward.
- **Gaps:** status blank for 93 %; capacity on 23 rows; no vintage.
- **Scenarios:** not used.

### LNG terminals

- **Sources:** LNG-T3 (Zhou et al. 2026, Zenodo, CC BY 4.0) as primary; GEM GGIT (CC BY 4.0) as supplement.
- **Build:** LNG-T3's 545 terminals are filtered to operating and in-construction (330); 25 names that carry both an operating and an expansion record are collapsed to the operating record, leaving **305**. GEM's per-train records are collapsed to one per terminal; a GEM terminal is dropped if an LNG-T3 terminal in the same country has the same name, or lies within **25 km** (terminal campuses are large). **7** GEM terminals survive. Result: **312 terminals** (73 export, 239 import).
- **Units:** nameplate capacity in million tonnes per annum, known for 310 of 312; LNG-T3 terminals also carry total processed volume (bcm), unit count and UN/LOCODE.
- **Time:** `commissioned_year` known for **305 of 312 (97.8 %)** — the best-dated layer on the map.
- **Scenarios:** the Hormuz-LNG scenario attributes at-risk LNG imports to import terminals — see [LNG import-terminal attribution](#lng-import-terminal-attribution).

### LNG voyages

- **Source:** LNG-T3 tanker-voyage table, 17,592 AIS-derived voyages from 2020-01-01 to 2024-12-31. CC BY 4.0.
- **What is drawn:** laden (export) voyages active in the selected year with confidence score ≥ 3 (of 5), as arcs from loading to discharge terminal. Voyages are joined to terminals by **terminal name** (every destination name resolves at build time).
- **Units:** cargo in cubic metres of LNG. Where tonnes are shown, 0.4245 t/m³ is used for display only (real density varies 0.41–0.46).
- **Time:** only 2020–2024; outside that range the layer is empty.
- **Partial coverage:** LNG-T3 is an AIS sample. Summed to annual tonnage it covers **22–41 % of GIIGNL's reported world LNG trade** in every year:

| Year | LNG-T3 (Mt) | GIIGNL (Mt) | Coverage |
|---|---|---|---|
| 2020 | 76.6 | 356.1 | 0.22 |
| 2021 | 105.0 | 372.3 | 0.28 |
| 2022 | 136.0 | 401.5 | 0.34 |
| 2023 | 164.8 | 401.4 | 0.41 |
| 2024 | 129.4 | 407.0 | 0.32 |

  (`scripts/validate/lng_t3_vs_giignl.py`, output checked in at `data/validation/lng_t3_vs_giignl.txt`.) The voyage arcs are therefore a sample of routes, not a census of trade, and **LNG-T3 is never used as a country total** anywhere in the site.

### Country boundaries and basemap

- **Country polygons:** Natural Earth 1:110m admin-0 (public domain), used for the reserves and exposure fills. Small islands and city-states (Singapore, Bahrain, …) have no polygon at this scale; they still appear in scenario tables.
- **Basemap:** OpenFreeMap "Positron" vector tiles — © OpenMapTiles, data from OpenStreetMap contributors. No API key; attribution is shown on the map.

## Time axis

The slider runs **1990–2024**. Each layer behaves differently:

- Reserves change until 2020, then hold the 2020 value (flagged on the map).
- Pipelines, extraction sites and LNG terminals hide features whose start/commissioning year is after the selected year; undated features always show.
- LNG voyages exist only for 2020–2024.
- Refineries, storage, ports and basins have no dates and are the same in every year — the map shows today's facilities on a 1990 background.
- Scenario trade data (BACI) starts in **1995**; a scenario in 1990–1994 has no trade to put at risk.

## Disruption scenarios

### What the scenario computes

For a scenario *S* (a chokepoint or pipeline), a commodity and a year:

```
at_risk(importer)  = Σ over exporters X of  imports(X → importer, year) × share(S, X, importer)
share_at_risk      = at_risk(importer) / total imports(importer, year)
```

`share(S, X, importer)` is the fraction of X's exports to that importer that moves through the route. A per-pair share wins over a per-exporter share; exporters with no share contribute nothing. The map colours each importer by `share_at_risk` (red is reserved for this), and the scenario panel ranks importers, refineries or LNG terminals.

This is a **static first-order exposure measure**: what fraction of last year's supply moved through the route. It does not model rerouting, spare pipeline capacity, strategic stocks, price response, or substitution between suppliers.

### Trade data (BACI)

- **Source:** CEPII BACI, HS92 release V202601, annual bilateral trade 1995–2024, reconciled from UN Comtrade mirror statistics. Quantities in **metric tonnes**. HS 2709 (crude petroleum) for oil scenarios; HS 271111 (liquefied natural gas) for Hormuz-LNG — pipeline gas (HS 271121) never transits a chokepoint, so HS 2711 would overstate Hormuz.
- **Cleaning:** BACI pseudo-country aggregates are removed and duplicate country-pair rows summed.
- **Quantity repair:** Some BACI **quantities** are wrong by one to three orders of magnitude while the values are fine (e.g. Philippines ← Saudi Arabia crude 2023: 80.9 Mt at 26 USD/t against a ~650 USD/t median; Taiwan ← Saudi Arabia 2014: 14 kt for USD 10.5 bn). Because the scenarios work in tonnes, `build_trade_flow.py` re-estimates any row whose unit value lies outside 5× of the (HS code, year) median as `value_usd / median`, keeping BACI's figure in `qty_reported` and flagging `qty_imputed` (9,655 of 53,727 rows, mostly tiny shipments; net −258 Mt crude and −520 Mt LNG across 1995–2024). Values are never changed.
- **Iran suppression:** BACI reports almost no Iranian crude exports in 2023–2024 (one near-zero pair). Exposure of importers that historically bought Iranian crude is **understated** for those years; the scenario panel says so.
- **Volumes:** panels show crude in kb/d using 7.33 barrels per tonne (EI's mean conversion) and LNG in Mt.
- **Licence:** CEPII publishes BACI under the Etalab Open Licence 2.0 (reuse and redistribution with attribution). Our processed bilateral table is downloadable from `/data` under the same licence; the full dataset is free from CEPII. Cite Gaulier & Zignago (2010), CEPII Working Paper 2010-23.

### Route shares

Eighteen hand-set shares drive every scenario (sixteen crude, two LNG-specific for Hormuz). Each is tied to a document and year in `disruption_route.parquet` (`source_title`, `source_url`, `source_year`, `source_note`), and shares are **static across years** — they do not follow maintenance outages, sanctions or contract changes. Six shares were revised to source-derived values on 2026-09-10; one (Russian crude via CPC) has no single supporting document and is flagged as an analyst estimate. A share set for an exporter–importer pair overrides the exporter-wide share for that buyer: since 2026-09-11 every Hormuz exporter has a **share-0 pair** for each other Gulf-coast country (Iran, Iraq, Kuwait, Qatar, Saudi Arabia, the UAE, Bahrain), because a cargo that stays inside the Gulf never crosses the strait (42 crude pairs, 12 LNG; listed as one row each below). The table below is generated from the parquet file at build time.

<!-- generated:scenario-shares -->

### Refinery attribution

For oil scenarios, a country's imports (and its at-risk imports) are split across its refineries in proportion to capacity:

```
refinery_share = capacity(R) / Σ capacity of refineries in the same country
```

When **no** refinery in the country has a known capacity, the split is even (1/N). When **some** do, refineries without a capacity receive no attribution. This is a country-level proxy: real feedstock depends on crude quality, contracts and ownership, which are not public at this resolution. Refineries in net-exporting countries (Saudi Arabia, Russia, …) show little or no exposure because the model only sees imports. The panel ranks refineries by capacity at risk, so rows without capacity are not ranked.

### LNG import-terminal attribution

For Hormuz-LNG, each importer's **country total always comes from BACI**. How it is split across that country's import terminals depends on the year:

- **2020–2024, country covered by LNG-T3 voyages:** the country total is split across its terminals in proportion to the volume of qualifying voyages (laden, confidence ≥ 3) each received, and each terminal's supplier mix comes from those voyages. Terminals in a covered country that received no qualifying voyage are marked **"no voyage data"** — a data gap, never shown as zero risk.
- **2020–2024, country not covered, and all years before 2020:** the country total is split by terminal capacity ("capacity proxy").

Because LNG-T3 covers only 22–41 % of world LNG trade, it is used only for *shares within a country*, never for volumes.

In every year, only terminals **in service** that year take a share: a terminal counts if it received a qualifying voyage that year, or if it is not under construction and its `commissioned_year` is unknown or not after the selected year. Observed cargoes win over the listed year because several terminals took commissioning cargoes before their formal start (Kuwait's Al Zour: cargoes in 2021, listed 2022). Where a country imported LNG in a year when none of its listed terminals was yet in service, its imports still count at country level but are not attributed to any terminal. This mostly affects terminals missing from the source, such as Kuwait's Mina al-Ahmadi FSRU (2009–2021), for which Al Zour used to stand in.

### Scenario notes

- **Close Strait of Hormuz (oil).** Chokepoint; one share per Gulf exporter, applied to all its buyers outside the Gulf (intra-Gulf pairs are 0, e.g. Saudi crude to Bahrain's Sitra refinery through the AB pipeline). Imports *into* the Gulf from outside also cross the strait but are out of scope: the scenario measures the Gulf's exports. Saudi Arabia (0.88) and the UAE (0.65) have bypass pipelines (East-West to Yanbu; Habshan-Fujairah); Iraq is 0.90 to reflect the northern Kirkuk-Ceyhan route (shut 2023–24, so recent Iraqi exposure is slightly understated); Iran, Kuwait, Qatar and Bahrain are 1.0. Iran's exports are suppressed in BACI for 2023–24 (above).
- **Close Strait of Hormuz (LNG).** Its own two shares (`hormuz_lng`), applied to HS 271111: Qatar 1.0 and the UAE 1.0 — both export plants (Ras Laffan, Das Island) load inside the Gulf and the UAE's Fujairah bypass carries crude only. Terminal attribution as above. Buyers inside the Gulf get share 0 (Qatari cargoes into Kuwait's Al Zour or Dubai's Jebel Ali never cross the strait); Kuwait's LNG from outside the Gulf, which does cross it inbound, is not counted.
- **Cut Druzhba pipeline.** Per-importer shares of Russian crude: Belarus, Slovakia, Hungary and Czechia 1.0 (landlocked or southern-branch-fed); Poland and Germany 0.47 (the ≈500 kb/d northern branch allocated pro-rata across their 2021 Russian imports; the rest came by tanker). Germany and Poland largely ended Russian pipeline crude in early 2023, but the share is static, so post-2022 results scale whatever Russian volumes BACI still records.
- **Cut Baku-Tbilisi-Ceyhan.** Azerbaijan 0.83 (EIA: about 83 % of Azerbaijan's oil exports use BTC), applied to all its buyers.
- **Cut Caspian Pipeline Consortium.** Kazakhstan 0.80 (EIA); Russia 0.035 — Russian-field CPC volumes against total Russian crude exports, an **analyst estimate** without a single source.

## Known limitations

- Infrastructure layers are snapshots with partial or no dates; the historical map is an approximation that shows too much in early years.
- Capacity is missing for most storage, ports, extraction sites and 70 % of refineries.
- Scenario exposure is annual, static and first-order (see above); route shares do not vary by year.
- BACI suppresses some flows (notably Iran 2023–24) and lags by about a year.
- LNG-T3 is a partial AIS sample (22–41 % of trade).
- Country polygons are 1:110m; small states appear in tables but not as fills.

## Reproducibility

Every shipped file is built by a Python script from public inputs: `uv run python -m scripts.build_all` runs every transform in order (add `--ingest` to re-download the pinned sources first) and finishes with `scripts.transform.build_catalog`, which records each file's size and sha256 in `public/data/catalog.json`. Every source's URL and release is pinned in one module (`scripts/common/sources.py`); how and when each is refreshed is in [`docs/refresh.md`](https://github.com/narendranag/global-energy-map/blob/main/docs/refresh.md). Rebuilding unchanged inputs is byte-identical, and `tests/python/test_data_integrity.py` fails if a shipped file drifts from its catalog entry. The browser reads the files directly (DuckDB-WASM over Parquet, plus GeoJSON sidecars); there is no server-side analytics path and no client-side call to any data provider.

## Licences

The code is MIT-licensed. The data keeps its original licences; [`LICENSE-DATA.md`](https://github.com/narendranag/global-energy-map/blob/main/LICENSE-DATA.md) sets out, source by source and in plain language, the licence, what we redistribute and in which file, the attribution line to keep, and the restrictions (it is a summary, not legal advice). In short:

- **CC BY 4.0** — Global Energy Monitor (extraction sites, pipelines, supplementary LNG terminals) and LNG-T3 (LNG terminals, voyages, daily flows). Reuse freely with the attribution line and a note of changes.
- **Public domain / attribution** — NETL GOGI (basins, storage, ports, refineries) is a US Government work; NETL's data portal lists it under a Creative Commons Attribution licence, so credit NETL. Natural Earth (country polygons) is public domain.
- **ODbL (share-alike)** — the 88 OpenStreetMap refineries. Shown on the map, never offered for download.
- **Energy Institute** — reserves and production: quoting with attribution is welcome, extensive reproduction needs EI permission. Shown in the app only.
- **CEPII BACI** — Etalab Open Licence 2.0. Our bilateral extract (`trade_flow.parquet`) is downloadable from `/data`; the full dataset is free from CEPII.
- **Basemap** — OpenFreeMap tiles © OpenMapTiles, data © OpenStreetMap contributors (ODbL); credited on the map.

### Downloads

The [Data page](/data) offers a file only when every row in it is CC BY 4.0, public domain, or the project's own route-share table. The map reads `assets.parquet`, which is view-only because it includes the OpenStreetMap rows; **`assets_open.parquet`** is the downloadable asset table — every other row (GEM, LNG-T3 and NETL: extraction sites, refineries, storage, ports and LNG terminals), same columns, with a `source` column naming each row's origin. From the map, **Share / cite** exports the rows of any visible CC BY or public-domain layer (CSV or GeoJSON) and the active scenario table (CSV; derived analysis, with every input cited in the file header).

## How to cite

<!-- generated:how-to-cite -->

## Required attributions

<!-- generated:attributions -->
