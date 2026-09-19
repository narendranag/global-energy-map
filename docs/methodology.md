# Methodology

This is the **current-state** methodology of Global Energy Map: for every map layer and every disruption scenario, where the data comes from, how current it is, how complete it is, what units it is in, what it cannot tell you, and how the scenarios use it. It describes the site as it is now. The phase-by-phase record of how it got here — including claims that later phases superseded — lives in [`docs/history.md`](https://github.com/narendranag/global-energy-map/blob/main/docs/history.md). The source-by-source research inventory (including sources evaluated and rejected) is [`docs/data-sources.md`](https://github.com/narendranag/global-energy-map/blob/main/docs/data-sources.md). File-level metadata — licence, as-of date, row count, size and sha256 for every shipped file — is on the [Data page](/data).

## At a glance

| Layer | Source | As of | Features | Follows the year slider | Units |
|---|---|---|---|---|---|
| Reserves (country) | Energy Institute Statistical Review | 2026 edition | 1990–2020, country-year | Yes, to 2020; 2020 value shown for 2021–2024 | oil: billion bbl · gas: Tcm |
| Basins | NETL GOGI | 2026-05-17 snapshot | 1,046 polygons | No | area km² |
| US shale regions | EIA STEO (history) + DPR county list | Sept 2026 STEO | 5 regions, 249 counties, 2009–2025 | Yes, from 2009 | crude kb/d · gas bcf/d |
| Extraction sites | GEM GOGET | 2026-03 | 7,055 | Partly — 32 % dated | — (no capacity) |
| Oil pipelines | GEM GOIT | 2025-04-09 | 1,185 | Partly — 64 % dated | kb/d |
| Gas pipelines | GEM GGIT | 2026-02-20 | 2,772 | Partly — 74 % dated | bcm/y |
| Refineries | NETL GOGI (primary) + OpenStreetMap | 2026-09 | 1,164 (1,075 + 89) | No | kb/d (30 % known) |
| Storage hubs | NETL GOGI (EPA regulatory records filtered out) | 2026-05-17 | 7,733 | No | — |
| Ports | NETL GOGI | 2026-05-17 | 3,694 | No | — |
| LNG terminals | LNG-T3 (primary) + GEM GGIT | 2026-04-01 / 2026-02-20 | 314 (305 + 9) | Yes — 97.5 % dated | Mtpa |
| LNG voyages | LNG-T3 | 2026-04-01 | 17,592 voyages, 2020–2024 | Yes, 2020–2024 only | m³ of LNG |
| Gas storage (EU) | GIE AGSI | daily, latest gas day | 20 countries | No — always the latest gas day | % full |
| Recent imports | UN Comtrade (as reported) | monthly, to 2026-05 | each country's latest 12 months | No — always the latest months | Mt |
| Trade flows | CEPII BACI, HS 2709 + 271111 | V202601 | top 150 pairs (world) or all of one country's (focused) | Yes, 1995–2024 only | tonnes |
| Scenario trade | CEPII BACI, HS 2709 + 271111 | V202601 | 53,727 country-pair-years, 1995–2024 | Yes | tonnes |
| Scenario route shares | EIA / IEA / Argus (Kpler) / GEM, per row | 2026-09-11 | 18 shares + 54 intra-Gulf share-0 pairs | No — static | fraction |

"Dated" means the feature carries a start or commissioning year. Undated features are shown in every year, so for layers that are only partly dated the map *over*-states what existed in early years.

### How current each layer is

Generated from the data catalog at build time, so it cannot drift from the files. **Covers** is the period the rows describe; **Released** is when the source published (or, for live services, when it was retrieved). They can be years apart: the Energy Institute's 2026 edition still ends its reserves in 2020. On the map, the *Data vintage* section of the layer panel lists the same dates, and a layer whose data ended more than 18 months ago is marked **old**.

<!-- generated:recency -->

## Map layers

### Reserves (country choropleth)

- **Source:** Energy Institute, *Statistical Review of World Energy* 2026 (75th edition) — "Oil: Proved reserves history" and "Gas: Proved reserves history" sheets. File `country_year_series.parquet`.
- **Coverage:** proved oil reserves (billion barrels) and proved gas reserves (trillion cubic metres), country-year, **1990–2020**. The same file carries oil production (kb/d) 1990–2025, shown in the country panel on the oil axis.
- **"Oil production" is total liquids, not crude.** It comes from EI's "Oil Production - barrels" sheet, which counts crude oil, shale oil, oil sands, condensates **and NGLs** — USA 2024 reads 20,276 kb/d here against roughly 13,200 kb/d of crude and condensate. The metric key in the parquet is still `production_crude_kbpd`, which is a misnomer we have not renamed because doing so would break every saved query-console link; read the key as "oil production", not "crude".
- **Reserves stop in 2020.** The reserves tables have not been updated past 2020; the 2026 edition extends production to 2025 but still ends reserves in 2020. For 2021–2024 the choropleth shows the **2020 value** and says so on the map ("Reserves: 2020 value"). No post-2020 change in the map is a real change in reserves.
- **Colour scale:** logarithmic, so both Venezuela-scale and small producers are distinguishable. Countries with no reserves row in the source get a neutral no-data tint, not the bottom of the ramp.
- **Gaps:** country aggregates only (no field, basin or sub-national split); EI's regional "Other …" residuals are not attributed to any country.
- **Scenarios:** not used. When a scenario is active the country fill switches from reserves to exposure.
- **Licence:** free to quote with attribution; the Energy Institute asks for permission before extensive reproduction of its tables, so the Data page does not offer the series for download (see [Licences](#licences)).

### Basins

- **Source:** US DOE National Energy Technology Laboratory, Global Oil and Gas Infrastructure (GOGI) — basins feature service, snapshot retrieved 2026-05-17. Public domain (17 USC §105).
- **Coverage:** 1,046 petroleum-bearing basin polygons with name, country, region and area. Geometry is simplified to ≈1 km for the browser (`basins.geojson`); full resolution stays in the build.
- **Gaps:** geological outlines, not production; many polygons lack a name; no time dimension.
- **Scenarios:** not used.

### US shale regions

- **Source:** US Energy Information Administration, *Short-Term Energy Outlook* (September 2026), API v2 series `COPR*` (crude oil production) and `NGMP*` (marketed natural gas production) for the Permian, Bakken, Eagle Ford, Haynesville and Appalachia regions. Files `shale_region_year.parquet` and `shale_regions.geojson`. US Government work, public domain.
- **What the regions are:** EIA defines each region as a set of **counties**, not a geological outline, and its numbers are everything produced in those counties. We draw exactly that: the counties listed in EIA's Drilling Productivity Report workbook (`RegionCounties`), dissolved over US Census 1:20m county polygons. A region's edge is a county line, and it includes production from every formation beneath it.
- **Assumption:** EIA moved the DPR into STEO in June 2024 and publishes no separate county list for the STEO regions, so we use the DPR's list for the five regions STEO kept (Anadarko and Niobrara now fall into STEO's "rest of Lower 48", which is not drawn). If EIA has since redrawn a region, our outline is out of date while the numbers are current.
- **History only.** STEO series run 18 months into the future in the same series as history, with no flag between them. The build keeps annual values through **2025** — the last complete year before the September 2026 release — and fails if a series stops short of that. No forecast is on the map.
- **Colour:** the slider year's crude output (oil view) or marketed gas output (gas view), square-root scaled against the largest value of that commodity in any region and year, so the Permian's growth shows as the slider moves. Before 2009 there is no EIA regional series and the regions draw as outlines only.
- **Units:** crude in thousand barrels per day (STEO's million b/d × 1,000, matching the reserves layer's production figures); marketed gas in billion cubic feet per day as EIA publishes it. The tooltip also shows 2025, a year past the slider's end.
- **Gaps:** US only — no open per-region production series exists elsewhere. Monthly values are ingested by EIA but not used; the slider is annual.

### Extraction sites

- **Source:** Global Energy Monitor, Global Oil & Gas Extraction Tracker (GOGET), March 2026 snapshot. CC BY 4.0.
- **Coverage:** 7,055 oil and gas fields with location, status (6,055 operating, 407 discovered, 228 mothballed, 202 in development, 20 abandoned, 16 decommissioning, 9 cancelled), operator and country.
- **Time:** `commissioned_year` is known for **2,279 of 7,055 (32 %)**; the other 68 % appear in every year.
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

- **Sources:** NETL GOGI Refineries (primary, public domain, snapshot 2026-05-17) plus OpenStreetMap (supplement, ODbL, Overpass snapshot 2026-09-17). Each row carries a `source` column.
- **Deduplication:**
  - *Within NETL* — NETL lists many plants more than once (an English name, a numbered "333 – …" variant, a French "Raffinerie de …" variant). Rows in the same country within **1 km** are merged, but never two rows whose known capacities differ by more than 5 %. 2,272 raw rows become **1,075**. A few probable duplicates with conflicting capacities (e.g. several Pemex plants) remain as two rows.
  - *OSM against NETL* — an OSM refinery is dropped when a NETL refinery in the **same country lies within 2 km**. The 2 km threshold is the knee of the nearest-neighbour distance distribution: matches under 2 km are the same facility; beyond it, genuinely distinct neighbours appear (e.g. Marcus Hook / Trainer). 168 OSM refineries become **88** supplements.
- **Units:** capacity in kb/d, parsed from NETL's free-text field; known for **350 of 1,163 (30 %)**; OSM rows never carry capacity.
- **Time:** no vintage in either source; refineries appear in every year.
- **Scenarios:** oil scenarios attribute each country's at-risk crude imports to its refineries — see [Refinery attribution](#refinery-attribution).
- **Licence:** the 88 OSM rows are ODbL (share-alike), so the refinery layer — and `assets.parquet`, which mixes them with CC BY and public-domain rows — is view-only. The 1,075 NETL refineries are in the downloadable `assets_open.parquet`.

### Storage hubs

- **Source:** NETL GOGI storage feature service, snapshot 2026-05-17. Public domain.
- **Coverage:** 7,733 oil and gas storage sites, drawn from zoom 4 upward to keep the world view legible. NETL's layer has 26,102 rows, but 23,501 are in the US and most of those are EPA regulatory records rather than storage facilities. The build drops four kinds of them:
  - leaking-underground-tank cleanup sites (6,025: petrol stations, garages);
  - SPCC spill-prevention plans (11,513: any site holding more than 1,320 US gallons of oil, including schools and farms);
  - an EPA state master list (721: shops);
  - rail, truck, air and port transfer points (110).

  It keeps EPA Facility Response Plan sites (3,669 sites with at least 1 million gallons of oil storage, including the Strategic Petroleum Reserve caverns), the EIA petroleum-product terminals (1,460) and all 2,601 non-US rows.
- **Bias:** two-thirds of the remaining rows (5,132) are still in the US, because the US inputs are far more complete than anywhere else. Read the layer as "bulk storage where NETL has records", not as an even global inventory.
- **Gaps:** capacity is present on only 4 rows, so the layer shows *where* storage is, not how much; no vintage; status is mostly blank.
- **Scenarios:** not used.

### Ports

- **Source:** NETL GOGI ports feature service, snapshot 2026-05-17. Public domain.
- **Coverage:** 3,694 oil and gas handling ports. Drawn from zoom 4 upward.
- **Gaps:** status blank for 93 %; capacity on 23 rows; no vintage.
- **Scenarios:** not used.

### LNG terminals

- **Sources:** LNG-T3 (Zhou, C. 2026, Zenodo, CC BY 4.0) as primary; GEM GGIT (CC BY 4.0) as supplement.
- **Build:** LNG-T3's 545 terminals are filtered to operating and in-construction (330); 25 names that carry both an operating and an expansion record are collapsed to the operating record, leaving **305**. GEM's per-train records are collapsed to one per terminal; a GEM terminal is dropped if an LNG-T3 terminal in the same country has the same name, or lies within **25 km** (terminal campuses are large). **9** GEM terminals survive. Result: **314 terminals** (74 export, 240 import).
- **Units:** nameplate capacity in million tonnes per annum, known for 312 of 314; LNG-T3 terminals also carry total processed volume (bcm), unit count and UN/LOCODE.
- **Time:** `commissioned_year` known for **306 of 314 (97.5 %)** — the best-dated layer on the map.
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

### Gas storage (EU)

- **Source:** Gas Infrastructure Europe, AGSI (storage) — daily, country level, 2020-01-01 to the latest published gas day. File `gie_daily.parquet`, which also carries ALSI LNG send-out and inventory (not drawn).
- **What is drawn:** each country's storage fullness as AGSI reports it (gas in store as a % of working gas volume) on the **most recent gas day** in the file. Countries GIE does not cover are drawn as no data, not as empty.
- **Time:** **not affected by the year slider.** The slider is annual and ends in 2024; this layer is a daily reading of the present, so it always shows the latest day, and its tooltip says which.
- **Scale:** the ramp tops out at 100 % and clamps above it. About 3 % of readings exceed 100 % (a site filled beyond its declared working volume); rescaling to the maximum would pale every ordinary country.
- **Gaps:** country level only. ALSI facility names match our LNG terminal names for only about 71 % of terminals, so terminal-level send-out is not joined.
- **Licence:** free with registration, attribution "GIE AGSI / ALSI"; not an open licence, so view-only (see [Licences](#licences)).

### Recent imports (UN Comtrade)

- **Source:** UN Comtrade monthly imports, HS 2709 (crude) and HS 271111 (LNG), January 2025 to the latest month with at least 50 reporters. File `comtrade_monthly.parquet`.
- **What is drawn:** each country's imports over **its own latest 12 reported months**, in the commodity selected (crude in the oil view, LNG in the gas view). Countries file months apart — Korea, France and Singapore stopped at December 2025 while most reach May 2026 — so the tooltip names each country's window, and a shared window would have drawn a filing delay as a collapse in imports.
- **As reported, not reconciled.** These are the importer's own declarations. BACI, which the scenarios use, reconciles both sides of every flow and is annual to 2024; the tooltip shows the country's BACI figure beside the Comtrade one, and the two are never added together or swapped.
- **Gaps:** China and Taiwan — the largest and tenth-largest crude importers in BACI 2024 — file no monthly reports to Comtrade and draw as no data. Comtrade publishes no zero rows, so a month with no cargo of the selected commodity looks identical to a month the country never reported at all — unless it filed the *other* code (crude or LNG) that month, which proves it was live. A month counts as reported if the country filed either code; a country with fewer than 12 such months in its window gets a lighter "incomplete" fill and the tooltip gives the partial total. Six LNG importers (Bulgaria, Colombia, Denmark, Kazakhstan, Romania, the USA) and nine crude importers count as complete on this rule that would not on cargo months alone; the tooltip says how many of the 12 months had a cargo. A complete total more than 2× off BACI is flagged in the tooltip; the largest such case by volume is Thailand's crude (117 Mt against BACI's 49 Mt for 2024).
- **Time:** not affected by the year slider; it always shows the latest months.
- **Licence:** UN Comtrade terms limit re-dissemination, so the layer is view-only and not downloadable.

### Trade flows (BACI)

- **Source:** the same CEPII BACI table the scenarios use — see [Trade data (BACI)](#trade-data-baci) below for its cleaning, quantity repair and known gaps (Iran suppression, Russia → Belarus). Crude (HS 2709) in the oil view, LNG (HS 271111) in the gas view.
- **What is drawn:** country-pair great-circle arcs, one exporter → importer pair per line, coloured light (exporter end) → dark (importer end) — the same light→dark convention `LNG voyages` uses, so a flow's direction reads without a legend — and widened by volume (square-root scaled). Oil arcs are warm-toned (pale gold → burnt umber), LNG arcs cool-toned (pale cyan → deep blue).
- **World view (no country selected):** only the largest **150 pairs** by volume for the selected year + commodity are drawn — every pair is a hairball otherwise. 150 was picked by measuring, across every year 1995–2024, how much of world volume the top-N pairs carry: top 150 holds 82–87 % of crude and 94–100 % of LNG every year (2024: crude 86.6 %, LNG 96.1 %). The legend states the cutoff and its coverage.
- **Focused on a country:** every one of that country's pairs is drawn instead — not just the ones that make the world top 150 — above a floor of 0.1 % of the country's own total trade (imports + exports) that year + commodity, so a large trader's noise (down to fractions of a tonne) does not draw as a pair. This is what answers "who supplies Japan?" — focus the map on Japan and every real supplier and customer shows, not just whichever happen to also be globally huge.
- **Tooltip:** exporter → importer, volume in Mt (+ kb/d for crude, using the same 7.33 bbl/t conversion the scenario panels use), each side's share of its own *quantified* imports/exports that year, source + as-of.
- **Null quantities:** 1,317 of BACI's 53,727 crude+LNG rows (checked 2026-09-19) report a flow with no quantity. Those rows are dropped before any pair, total or share is computed, so every share on the map and in the tooltip is a share of *quantified* trade, not of everything BACI reports — a country with a disproportionate share of unquantified rows would read as having a smaller footprint here than its full reported trade.
- **Anchors:** each side of an arc lands on a fixed lon/lat anchor per country (`src/lib/geo/country-anchors.ts`) — the representative point of its largest Natural Earth polygon, hand-moved for a handful of countries where that point sits nowhere near where energy actually loads or lands (the US Gulf Coast, not the Great Plains; western Russia, not Siberia; Alberta, not the Canadian centroid; similarly Australia, Norway, Chile, Indonesia, Malaysia, France) — plus a capital/settlement point for BACI codes with no 1:110m polygon (Singapore, Bahrain, Malta, Hong Kong, and more).
- **Time:** 1995–2024 only (BACI's coverage); outside that range the layer is on but empty.
- **Downloadable:** BACI's catalog entry is CC-derived / Etalab-licensed, so this layer's CSV/GeoJSON export is available (unlike EI reserves or GIE gas storage) — it exports exactly the pairs on screen (the world top 150, or the focused country's set).

### Country boundaries and basemap

- **Country polygons:** Natural Earth 1:110m admin-0 (public domain), used for the reserves and exposure fills. Small islands and city-states (Singapore, Bahrain, …) have no polygon at this scale; they still appear in scenario tables.
- **Basemap:** OpenFreeMap "Positron" vector tiles — © OpenMapTiles, data from OpenStreetMap contributors. No API key; attribution is shown on the map.

## Time axis

The slider runs **1990–2024**. Each layer behaves differently:

- Reserves change until 2020, then hold the 2020 value (flagged on the map).
- Pipelines, extraction sites and LNG terminals hide features whose start/commissioning year is after the selected year; undated features always show.
- LNG voyages exist only for 2020–2024.
- US shale regions have EIA data from 2009; earlier years draw outlines only.
- Refineries, storage, ports and basins have no dates and are the same in every year — the map shows today's facilities on a 1990 background.
- Scenario trade data (BACI) starts in **1995**; a scenario in 1990–1994 has no trade to put at risk. The Trade flows layer reads the same table and is likewise empty before 1995.

## Disruption scenarios

### What the scenario computes

For a scenario *S* (a chokepoint or pipeline), a commodity and a year:

```
at_risk(importer)  = Σ over exporters X of  imports(X → importer, year) × share(S, X, importer)
share_at_risk      = at_risk(importer) / total imports(importer, year)
```

`share(S, X, importer)` is the fraction of X's exports to that importer that moves through the route. A per-pair share wins over a per-exporter share; exporters with no share contribute nothing. The map colours each importer by `share_at_risk` (red is reserved for this), and the scenario panel ranks importers, refineries or LNG terminals.

The map also marks **where** the disruption is: a closure glyph at the chokepoint, or — for a pipeline scenario — the route's own GEM features redrawn as a highlighted cut line with the glyph on it. The cut route is shown whether or not the pipelines layer is switched on and whatever the year slider says, because the route is the subject of the scenario rather than infrastructure you chose to see; its position and vintage still come from `pipelines.geojson` unchanged. Picking a scenario frames the disruption together with the eight importers losing the most volume; a link that already carries a camera (`lon`/`lat`/`z`) keeps it. Hovering a ranked row highlights its country or asset on the map, and clicking one selects the country (and puts it in the URL as `focus=`).

This is a **static first-order exposure measure**: what fraction of last year's supply moved through the route. It does not model rerouting, spare pipeline capacity, strategic stocks, price response, or substitution between suppliers.

### Trade data (BACI)

- **Source:** CEPII BACI, HS92 release V202601, annual bilateral trade 1995–2024, reconciled from UN Comtrade mirror statistics. Quantities in **metric tonnes**. HS 2709 (crude petroleum) for oil scenarios; HS 271111 (liquefied natural gas) for the LNG axis of Hormuz, Malacca, Suez+SUMED and Bab el-Mandeb — pipeline gas (HS 271121) never transits a chokepoint, so HS 2711 would overstate any of them.
- **Cleaning:** BACI pseudo-country aggregates are removed and duplicate country-pair rows summed.
- **Quantity repair:** Some BACI **quantities** are wrong by one to three orders of magnitude while the values are fine (e.g. Philippines ← Saudi Arabia crude 2023: 80.9 Mt at 26 USD/t against a ~650 USD/t median; Taiwan ← Saudi Arabia 2014: 14 kt for USD 10.5 bn). Because the scenarios work in tonnes, `build_trade_flow.py` re-estimates any row whose unit value lies outside 5× of the (HS code, year) median as `value_usd / median`, keeping BACI's figure in `qty_reported` and flagging `qty_imputed` (9,655 of 53,727 rows, mostly tiny shipments; net −258 Mt crude and −520 Mt LNG across 1995–2024). Values are never changed.
- **Iran suppression:** BACI's Iranian crude falls from 89 Mt (2018) to 28 Mt (2019), about 4 Mt in 2020–21 and near zero in 2023–24 (2022's 31 Mt is mostly one partner). Sanctioned cargoes are reported under other origins; Malaysia→China crude, for instance, grows from 7 Mt (2019) to 41.5 Mt (2024). Exposure of Iran's buyers (China above all) is **understated** from 2019, and the scenario panel says so for those years.
- **Russia → Belarus:** BACI records Russian crude into Belarus through 2021 (16 Mt) and **none from 2022**, although Belarus's refineries still run on Russian crude. The Druzhba scenario therefore loses its largest single buyer from 2022, and the scenario panel says so.
- **Volumes:** panels show crude in kb/d using 7.33 barrels per tonne (EI's mean conversion) and LNG in Mt.
- **Licence:** CEPII publishes BACI under the Etalab Open Licence 2.0 (reuse and redistribution with attribution). Our processed bilateral table is downloadable from `/data` under the same licence; the full dataset is free from CEPII. Cite Gaulier & Zignago (2010), CEPII Working Paper 2010-23.

### Route shares

`disruption_route.parquet` has 522 rows across 15 route-share sets (`disruption_id` values) drawn from 11 scenarios (2026-09-19; three scenarios — Malacca, Suez+SUMED, Bab el-Mandeb — carry a separate oil and gas/LNG route set each, hence 15 sets from 11 scenarios). Eighteen of those are the original hand-set exporter-wide shares behind Hormuz, Druzhba, BTC and CPC (sixteen crude, two LNG-specific for Hormuz); the rest are either share-0 carve-outs (54 intra-Gulf Hormuz pairs, plus three Turkish Straits pairs for Kazakh crude that demonstrably avoids the Straits — see below) or **region-expanded exporter→importer pairs** for the five chokepoints added 2026-09-19 (Malacca, Suez+SUMED, Bab el-Mandeb, Turkish Straits), each row still tied to a document and year (`source_title`, `source_url`, `source_year`, `source_note`). Shares are **static across years** — they do not follow maintenance outages, sanctions or contract changes. Six of the original eighteen were revised to source-derived values on 2026-09-10; one (Russian crude via CPC) has no single supporting document and is flagged as an analyst estimate. A share set for an exporter–importer pair overrides the exporter-wide share for that buyer: every Hormuz exporter has a **share-0 pair** for each other Gulf-coast country (Iran, Iraq, Kuwait, Qatar, Saudi Arabia, the UAE, Bahrain), because a cargo that stays inside the Gulf never crosses the strait (42 crude pairs, 12 LNG). The newer chokepoints use the same override mechanism for direction, not geography inside one region: Malacca, Suez and Bab el-Mandeb only expose the exporter→importer-region pairs whose cargo physically needs that route (Gulf crude to Europe crosses Bab el-Mandeb; to East Asia it does not), so a pair not listed defaults to 0 rather than inheriting an exporter-wide wildcard. The table below is generated from the parquet file at build time.

<!-- generated:scenario-shares -->

### Partial closures, combined scenarios and the exporter view

Three controls change what the numbers above describe. Each writes one URL parameter, so a link carries exactly what was on screen; a link with none of them means what it always did.

**Severity (`sev=`, 5–100 %).** The slider is the fraction of what the route carries that is cut, not a fraction of the country's supply. It multiplies the route share and nothing else:

```
at_risk(importer) = Σ over exporters X of imports(X → importer) × share(S, X, importer) × severity
```

Total imports — the denominator of `share_at_risk` — are untouched, so a 50 % closure is exactly half the volume at risk and half the percentage. Every downstream view (refineries, LNG terminals, the map fills, the CSV) reads the same multiplied share. The scale is deliberately linear and deliberately dumb: it says "this much of the route stops", not "this is what a partial closure would do to prices, queues or rerouting", none of which this model contains.

**Combining two scenarios (`scenario2=`), reported as a range.** Each scenario's own rows are resolved first — pair beats wildcard, including a share of 0 — and only then combined, so a flow one scenario carves out cannot be readmitted by another's wildcard. For two closures A and B carrying shares *a* and *b* of one flow, we know the fractions but **not which cargoes**, so the truly-cut fraction is unknown. It is, however, bounded, and both bounds are arithmetic rather than modelling choices:

```
max(a, b)  ≤  cut  ≤  min(1, a + b)
```

The lower bound is reached when the routes are **in series** — the same barrels cross both, so closing both cuts that cargo once. Qatari LNG to Japan transits Hormuz *and* Malacca; closing both does not cut it twice. The upper bound is reached when they are **in parallel** — different barrels, e.g. Canadian crude reaching the US Midwest either on Keystone or on the Enbridge Mainline, so the two closures add. Every headline figure quotes the **lower bound** (the defensible "at least this much"), and the range is shown beside it only where the two ends actually differ once rounded.

Worked examples, both crude, 2024, from the shipped data:

| Scenarios | Country | Range |
|---|---|---|
| Hormuz | Japan | 73.3 % |
| Malacca | Japan | 94.9 % |
| Hormuz + Malacca | Japan | 94.9 % (in series — no wider than Malacca alone) |
| Keystone + Enbridge Mainline | United States | 36.5 – 45.0 % (in parallel) |

Limits worth stating plainly: the bounds are only as good as the shares they combine, and the shares are static across years; the range is not a confidence interval and carries no probability; `1 − (1 − a)(1 − b)` (independent-probability composition) is **not** used, because these are fixed physical routings rather than independent random events and that formula lands between the bounds for no reason anyone can cite. Asset-level rows — refineries and LNG terminals — quote the lower bound only: spreading a *range* across a country's plants by capacity would multiply an already-coarse proxy by an interval, and the CSV header says so.

**Exporter view (`view=exporters`).** The same rows read the other way round: what an exporter loses of its outlet, rather than what an importer loses of its supply.

```
at_risk(exporter) = Σ over importers M of exports(exporter → M) × share(S, exporter, M) × severity
share_at_risk     = at_risk(exporter) / total exports(exporter, year)
```

Because both sides sum the same products over the same flows, Σ exporter at-risk ≡ Σ importer at-risk — the two views are two readings of one number, and the map's red ramp simply shades the other side. The denominator differs, though: an exporter's total is everything BACI records it exporting of that commodity, so a country with no BACI export rows does not appear at all. For Hormuz crude in 2024 the exporter view ranks Saudi Arabia first (272.1 Mt at risk of 309.2 Mt exported, 88 %), then Iraq (156.2 Mt, 90 %) and the UAE (119.0 Mt, 65 %).

The country panel's exposure list is deliberately **not** affected by any of the three: it runs every scenario one at a time at full severity, which is what makes its rows comparable with each other. When a partial or combined closure is active the panel says so, so the two figures on screen cannot silently disagree.

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

- **Close Strait of Hormuz (oil).** Chokepoint; one share per Gulf exporter, applied to all its buyers outside the Gulf (intra-Gulf pairs are 0, e.g. Saudi crude to Bahrain's Sitra refinery through the AB pipeline). Imports *into* the Gulf from outside also cross the strait but are out of scope: the scenario measures the Gulf's exports. Saudi Arabia (0.88) and the UAE (0.65) have bypass pipelines (East-West to Yanbu; Habshan-Fujairah); Iraq is 0.90 to reflect the northern Kirkuk-Ceyhan route (shut 2023–24, so recent Iraqi exposure is slightly understated); Iran, Kuwait, Qatar and Bahrain are 1.0. Iran's exports are largely missing from BACI from 2019 (above).
- **Close Strait of Hormuz (LNG).** Its own two shares (`hormuz_lng`), applied to HS 271111: Qatar 1.0 and the UAE 1.0 — both export plants (Ras Laffan, Das Island) load inside the Gulf and the UAE's Fujairah bypass carries crude only. Terminal attribution as above. Buyers inside the Gulf get share 0 (Qatari cargoes into Kuwait's Al Zour or Dubai's Jebel Ali never cross the strait); Kuwait's LNG from outside the Gulf, which does cross it inbound, is not counted.
- **Cut Druzhba pipeline.** Per-importer shares of Russian crude: Belarus, Slovakia, Hungary and Czechia 1.0 (landlocked or southern-branch-fed); Poland and Germany 0.47 (the ≈500 kb/d northern branch allocated pro-rata across their 2021 Russian imports; the rest came by tanker). Germany and Poland largely ended Russian pipeline crude in early 2023, but the share is static, so post-2022 results scale whatever Russian volumes BACI still records. From 2022 BACI has no Russia→Belarus rows (above), so Belarus is missing from those years.
- **Cut Baku-Tbilisi-Ceyhan.** Azerbaijan 0.83 (EIA: about 83 % of Azerbaijan's oil exports use BTC), applied to all its buyers.
- **Cut Caspian Pipeline Consortium.** Kazakhstan 0.80 (EIA); Russia 0.035 — Russian-field CPC volumes against total Russian crude exports, an **analyst estimate** without a single source.
- **Close Strait of Malacca (oil).** Direction-dependent: Saudi Arabia, the UAE, Kuwait, Iraq, Qatar, Bahrain and Oman are 1.0 to East Asia (minus Indonesia, whose Java refineries are reached via the Sunda/Lombok straits instead) and 0 to South Asia, which is reached by crossing the Arabian Sea directly. The US Atlantic/Gulf Coast is 0.60 to East Asia (EIA/Bernama's 0.8 mb/d against BACI's 1.35 mb/d actual trade). Iran's Malacca crude (EIA: ~1.6 mb/d in 1H2025) is a known omission — BACI shows near-zero Iranian crude to China, which does not declare it.
- **Close Strait of Malacca (LNG).** Qatar 1.0 to East Asia. No Australia row: roughly a third of Australian LNG loads on the east coast and sails the Coral/Philippine Sea, never approaching Malacca; the rest routes via Lombok/Makassar, a different strait system.
- **Close Suez Canal + SUMED (oil).** Direction-dependent: Saudi Arabia, the UAE, Kuwait, Qatar, Iraq and Bahrain are 1.0 to Europe/the Mediterranean, structural (no bypass short of the Cape of Good Hope; the SUMED pipeline is inside this chokepoint's own definition, not a bypass of it) and 0 to East/South Asia, which never enters the Red Sea. No Iran row — BACI shows ~0 Iranian crude to Europe after 2018 sanctions. **No USA row (known omission)** — an earlier version of this scenario treated all Gulf crude to the US as Suez/SUMED-routed (implying USA was the top-exposed importer, ~30.3 Mt / 9% of US crude imports, on no cited share); Gulf crude to US Gulf Coast refineries routinely sails around the Cape instead, and no EIA/IEA document was found splitting the two routes, so USA was dropped from this scenario's importer set rather than kept on an uncited number. **Coverage gap** — Red Sea littoral importers (Egypt, Jordan, Israel, Sudan) are not in the Europe/Mediterranean importer set this scenario uses, so their own Suez-transiting imports are out of scope here, not modelled as zero exposure.
- **Close Suez Canal + SUMED (LNG).** Qatar 1.0 to Europe (EIA: "nearly all (98%) of the northbound LNG transit is from Qatar and mainly destined for European markets").
- **Close Bab el-Mandeb Strait (oil).** Direction-dependent: the UAE, Kuwait, Qatar, Iraq and Bahrain are 1.0 to Europe/the Mediterranean; **Saudi Arabia is 0** — its Europe-bound crude loads at Yanbu on the Red Sea via the East-West pipeline, north of the strait, so it never crosses Bab el-Mandeb (it still crosses Suez, above). **Coverage gap** — as with Suez, Red Sea littoral importers (Egypt, Jordan, Israel, Sudan) are not in the Europe/Mediterranean importer set this scenario uses, so their own Bab el-Mandeb-transiting imports are out of scope here, not modelled as zero exposure.
- **Close Bab el-Mandeb Strait (LNG).** Qatar 1.0 to Europe, same EIA citation as Suez LNG (the cargo transits both straits on one voyage).
- **Close Turkish Straits.** Kazakhstan 0.80 (EIA, the same figure as the CPC row — of the CPC-blend crude that reaches Novorossiysk, essentially all of it then crosses the Bosporus/Dardanelles, the Black Sea's only sea exit), with explicit share-0 pairs for Bulgaria and Romania (Black Sea importers that never reach the Straits), China (reached by the separate Kazakhstan–China pipeline, not by sea), **Germany** (KEBCO crude reaches Germany's PCK Schwedt refinery entirely overland via the Uzen-Atyrau-Samara pipeline and Transneft's Druzhba system — Reuters, 2026 — never loaded onto a tanker) and **Uzbekistan/Kyrgyzstan** (landlocked neighbours reached overland; unsourced but structural, and both are small BACI volumes). Austria, Czechia and Switzerland are deliberately *not* zeroed even though they too receive Kazakh-blend crude inland: theirs arrives via the TAL pipeline from Trieste, fed by CPC-blend crude that does sail from Novorossiysk through the Straits first. No Russia row: BACI has no port-of-loading field and cannot separate Russia's Black Sea exports (which transit) from its Baltic and Pacific exports (which do not), and the split is itself changing month to month in 2026.
- **Cut Keystone pipeline.** Canada 0.14 to the US (Canada Energy Regulator: "about 14% of western Canadian crude oil exports").
- **Cut Enbridge Mainline.** Canada 0.60 to the US — CER states "about 58% of all Canadian crude oil exports"; converted to a Canada→US basis using BACI's 2020 Canada-total vs. Canada→US split (the CER figure's own vintage).
- **Cut ESPO Skovorodino-Mohe spur.** Russia 0.28 to China — the direct pipeline spur's design capacity (602 kb/d, GEM P5174) against BACI's Russia→China total, deliberately excluding Kozmino's seaborne ESPO Blend, which is sold FOB to Asian buyers generally and cannot be separated in BACI from other Russian crude reaching China by tanker since 2022 sanctions.

### Scenario context

The scenario panel's **Context** block (T3) ties the two live, view-only layers above — [Gas storage (EU)](#gas-storage-eu) and [Recent imports (UN Comtrade)](#recent-imports-un-comtrade) — to the active scenario's own result. Both figures are honesty checks beside a number the scenario already computed from BACI; neither is ever recomputed into exposure, and neither ever appears in the scenario CSV export (BACI/route-share derived analysis only — see [Downloads](#downloads)).

- **EU gas-storage cover.** Shown only on the gas axis, only when an LNG-carrying chokepoint (Hormuz, Malacca, Suez+SUMED, Bab el-Mandeb) is active, and only for the exposed importers GIE covers **with a current reading** (a country whose latest published gas day is more than 30 days behind GIE's most recent global day is dropped rather than shown as if current — see below). For each, the block converts the scenario's at-risk LNG (BACI tonnes for the selected year) to energy terms — 1 Mt LNG ≈ **15.644 TWh** (53.38 mmBtu/t gross calorific value, the IGU industry convention: International Gas Union, *Natural Gas Conversion Guide*, 2012 — matching AGSI's own gross-calorific-value basis for `gasInStorage`) — and shows it beside that country's latest AGSI reading: gas in storage (TWh) and fullness (%, not clamped above 100 — see [Gas storage (EU)](#gas-storage-eu)). "Days of cover" = storage TWh ÷ (at-risk TWh/year ÷ 365). This is a **scale comparison, not a forecast**: storage is a stock that serves *all* of a country's gas demand, not just the LNG that would be lost from one chokepoint, so a large days-of-cover figure (Italy's Hormuz-LNG exposure in 2024 runs to roughly 850 days) says the at-risk volume is small next to the stockpile, not that the stockpile would last that long if the route actually closed. BACI's year and AGSI's gas day are named separately because they are different dates — annual vs. daily.
- **Recent imports check.** For the same scenario's top exposed importers, the block shows each country's latest-12-reported-month UN Comtrade total (Mt, its own window, completeness and >2× BACI-divergence flags — see [Recent imports (UN Comtrade)](#recent-imports-un-comtrade)) beside the BACI figure the scenario itself used. It is a **recency check**, never a second exposure computation: Comtrade's monthly file does carry an exporter column (partner-level detail), so a true baseline restricted to a scenario's own exporter(s) is possible in principle, but the existing loader aggregates every exporter, and this block only ever compares that importer total to BACI. China and Taiwan file no monthly reports and show as such.
- Both blocks load lazily (only when they have something to show), are `fatal: false` (a failed fetch shows an inline notice, never the map's error panel), are excluded from the page's `pending`/`data-ready` signal — same as the country panel — and are hidden under `?embed=1`.

## Known limitations

- Infrastructure layers are snapshots with partial or no dates; the historical map is an approximation that shows too much in early years.
- Capacity is missing for most storage, ports, extraction sites and 70 % of refineries.
- Scenario exposure is annual, static and first-order (see above); route shares do not vary by year.
- BACI suppresses some flows (Iran from 2019; Russia→Belarus from 2022) and lags by about a year.
- LNG-T3 is a partial AIS sample (22–41 % of trade).
- Country polygons are 1:110m; small states appear in tables but not as fills.

## Reproducibility

Every shipped file is built by a Python script from public inputs: `uv run python -m scripts.build_all` runs every transform in order (add `--ingest` to re-download the pinned sources first) and finishes with `scripts.transform.build_catalog`, which records each file's size and sha256 in `public/data/catalog.json`. Every source's URL and release is pinned in one module (`scripts/common/sources.py`); how and when each is refreshed is in [`docs/refresh.md`](https://github.com/narendranag/global-energy-map/blob/main/docs/refresh.md). Rebuilding unchanged inputs is byte-identical, and `tests/python/test_data_integrity.py` fails if a shipped file drifts from its catalog entry. The browser reads the files directly (Parquet decoded in the page, plus GeoJSON sidecars); there is no server-side analytics path and no client-side call to any data provider.

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
