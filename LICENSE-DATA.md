# Data licences

The **code** in this repository is MIT-licensed (see [`LICENSE`](LICENSE)). The **data** is not ours: every dataset keeps the licence its publisher gave it. This file says, source by source, what licence applies, what we redistribute and in which file, the attribution line to keep, and what you may not do with it.

> **Not legal advice.** This is a plain-language summary written for researchers, checked against each publisher's terms page on 2026-09-10. The publisher's own terms always win — follow the links and read them before you reuse anything, especially commercially.

The per-file licence, row count, size and sha256 are also listed on the live [Data page](https://energymap.marain.space/data) and in [`public/data/catalog.json`](public/data/catalog.json).

## Summary

| Source | Licence | Files we ship | Downloadable from /data? | Attribution to keep |
|---|---|---|---|---|
| Global Energy Monitor (GOGET, GOIT, GGIT) | CC BY 4.0 | `assets.parquet`, `assets_open.parquet`, `pipelines.geojson` | Yes (`assets_open.parquet`, `pipelines.geojson`) | Data: Global Energy Monitor, CC BY 4.0 |
| LNG-T3 (Zhou, C. 2026, Zenodo) | CC BY 4.0 | `assets.parquet`, `assets_open.parquet`, `lng_voyage.parquet`, `lng_trade_daily.parquet`, `lng_terminal_daily.parquet` | Yes | Data: Zhou, C. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058), CC BY 4.0 |
| NETL Global Oil & Gas Infrastructure (US DOE) | US Government work (public domain); NETL's data portal lists it as Creative Commons Attribution | `assets.parquet`, `assets_open.parquet`, `basins.geojson` | Yes (`assets_open.parquet`, `basins.geojson`) | Data: NETL Global Oil & Gas Infrastructure (GOGI), US DOE |
| Natural Earth | Public domain | `countries.geojson` | Yes | None required ("Made with Natural Earth" appreciated) |
| OpenStreetMap (88 refinery rows) | ODbL 1.0 (share-alike) | `assets.parquet` only | No | © OpenStreetMap contributors, ODbL |
| Energy Institute Statistical Review | EI terms: quote with attribution, permission for extensive reproduction | `country_year_series.parquet` | No (shown in the app only) | Data: Energy Institute Statistical Review of World Energy 2025 |
| CEPII BACI | Etalab Open Licence 2.0 | `trade_flow.parquet` | Yes | Data: CEPII BACI (release V202601); cite Gaulier & Zignago (2010) |
| Scenario route shares (our derivation from EIA, IEA, GEM, Argus/Kpler reporting) | Our own table, per-row citations | `disruption_route.parquet` | Yes | Cite this project and the source on each row |
| Basemap: OpenFreeMap / OpenMapTiles / OpenStreetMap | OSM data ODbL; OpenMapTiles design CC BY 4.0; OpenFreeMap MIT | Not shipped (tiles load from OpenFreeMap) | — | OpenFreeMap © OpenMapTiles, data from OpenStreetMap contributors |

"Downloadable" follows one rule (the Phase 9 decision): a file is offered on /data only when **every** row in it is CC BY 4.0, public domain, or the project's own derived table. That is why `assets.parquet` (which the map reads) is view-only and `assets_open.parquet` (the same table minus its 88 OpenStreetMap rows) is the download.

## Source by source

### Global Energy Monitor — CC BY 4.0

- **Terms:** [GEM Creative Commons licence page](https://globalenergymonitor.org/creative-commons-public-license/); licence text: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **What we redistribute:** extraction sites (Global Oil and Gas Extraction Tracker, July 2023) and 7 supplementary LNG terminals (Global Gas Infrastructure Tracker, 2026-02-20) as rows of `assets.parquet` / `assets_open.parquet`; oil and gas pipelines (Global Oil Infrastructure Tracker 2025-04-09, Global Gas Infrastructure Tracker 2026-02-20) as simplified geometry in `pipelines.geojson`.
- **Changes we made:** columns renamed and harmonised to our schema, units normalised, pipeline geometry simplified (~500 m tolerance), rows filtered by status. CC BY asks you to say that changes were made; this list is that notice.
- **You may:** copy, redistribute and adapt the data for any purpose, including commercially.
- **You must:** keep the attribution line, link to the licence, indicate changes, and not imply GEM endorses your use.

### LNG-T3 (Zhou, C. 2026) — CC BY 4.0

- **Terms:** [Zenodo record 10.5281/zenodo.19571058](https://doi.org/10.5281/zenodo.19571058) (licence shown on the record: CC BY 4.0).
- **What we redistribute:** 305 LNG terminals (rows of `assets.parquet` / `assets_open.parquet`), 17,592 AIS-derived voyages (`lng_voyage.parquet`), and the daily trade and terminal-throughput tables (`lng_trade_daily.parquet`, `lng_terminal_daily.parquet`), 2020–2024.
- **Changes we made:** terminals filtered to operating/construction and duplicate names collapsed; country names mapped to ISO3; unique voyage ids added.
- **You must:** credit Zhou, C. 2026 with the DOI, link the licence, indicate changes. Please also cite the paper/dataset in academic work.

### NETL Global Oil & Gas Infrastructure (GOGI) — US Government work

- **Terms:** GOGI is published by the US Department of Energy's National Energy Technology Laboratory. Works of US federal employees are not subject to US copyright ([17 USC §105](https://www.law.cornell.edu/uscode/text/17/105)). NETL's own data portal lists the GOGI collection under a **Creative Commons Attribution** licence ([EDX dataset page](https://edx.netl.doe.gov/dataset/global-oil-gas-infrastructure-features-database-edx-spatial-webmap)), and GOGI compiles several hundred third-party open datasets whose own terms may carry through. We therefore treat it as **attribution required**.
- **What we redistribute:** 1,046 basin polygons (`basins.geojson`, simplified), 7,733 storage sites, 3,694 ports and 1,075 refineries (rows of `assets.parquet` / `assets_open.parquet`), from a 2026-05-17 snapshot of NETL's ArcGIS layers.
- **Changes we made:** duplicate refinery listings merged within 1 km, capacities parsed from text, country names mapped to ISO3, basin geometry simplified.
- **Please cite:** Sabbatino, M., Romeo, L., Baker, V., Bauer, J., Barkhurst, A., Bean, A., DiGiulio, J., Jones, K., Jones, T.J., Justman, D., Miller III, R., Rose, K., and Tong, A., *Global Oil & Gas Features Database*, NETL EDX, 2017-12-12, [doi:10.18141/1427300](https://doi.org/10.18141/1427300).

### Natural Earth — public domain

- **Terms:** [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/) — public domain; no permission or credit required, credit appreciated.
- **What we redistribute:** 1:110m admin-0 country polygons (`countries.geojson`).

### OpenStreetMap — ODbL 1.0 (share-alike)

- **Terms:** [OpenStreetMap copyright and licence](https://www.openstreetmap.org/copyright); licence text: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- **What we use:** 88 refineries (queried from the Overpass API on 2026-05-15) that NETL does not already list within 2 km. They are rows of `assets.parquet`, shown on the refinery layer with a visible "© OpenStreetMap contributors" credit.
- **Why they are not downloadable:** ODbL is share-alike — a database built from OSM data may only be redistributed under the ODbL. If we offered `assets.parquet` as-is, the whole asset table would arguably become an ODbL derivative database. We keep the OSM rows inside the app and publish the rest as `assets_open.parquet`. If you need the OSM rows, query OpenStreetMap directly (and share your derivative under the ODbL).

### Energy Institute Statistical Review of World Energy — EI terms

- **Terms:** the Energy Institute welcomes quoting from the Statistical Review provided the source is attributed, and asks that permission be obtained first for **extensive reproduction** of its tables or charts; data the Review sources from S&P Global may not be redistributed without S&P's permission. See the [Statistical Review "About" page](https://www.energyinst.org/statistical-review/about) (its pages block automated clients, so we could not re-check the wording on 2026-09-10; this summary is from the EI's published usage statement).
- **What we use:** oil and gas proved reserves (1990–2020) and crude oil production (1990–2024) by country, from the 2025 edition, in `country_year_series.parquet` — shown on the reserves choropleth and in tooltips.
- **Why it is not downloadable:** a bulk re-download of the country-year series is extensive reproduction, so /data does not offer it. Get the workbook from the [Energy Institute](https://www.energyinst.org/statistical-review/resources-and-data-downloads).

### CEPII BACI — Etalab Open Licence 2.0

- **Terms:** CEPII's [BACI page](https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37) now lists BACI under the [Etalab Open Licence 2.0](https://www.etalab.gouv.fr/wp-content/uploads/2018/11/open-licence.pdf), which permits reuse and redistribution (including commercial) provided you credit the source and the date of its last update. CEPII asks users to cite Gaulier, G. and Zignago, S. (2010), *BACI: International Trade Database at the Product-Level. The 1994–2007 Version*, CEPII Working Paper 2010-23.
- **What we use:** bilateral annual trade for HS 2709 (crude) and HS 271111 (LNG), 1995–2024, release V202601, filtered and re-keyed to ISO3 in `trade_flow.parquet`. It drives every disruption scenario.
- **Redistribution:** our filtered extract (`trade_flow.parquet`) is downloadable from `/data` under the same Etalab Open Licence 2.0. Credit "CEPII BACI" with the release (V202601) and cite Gaulier & Zignago (2010). Earlier project documents described BACI as academic-use-only; CEPII's current licence supersedes that. The full dataset is free from CEPII.

### Scenario route shares — our derived table

- **What it is:** `disruption_route.parquet` holds 18 hand-set shares ("what fraction of exporter X's crude/LNG uses route Y"), each with the document it comes from (`source_title`, `source_url`, `source_year`, `source_note`). Sources are EIA analysis briefs (US Government, public domain — [EIA reuse policy](https://www.eia.gov/about/copyrights_reuse.php)), IEA reports (IEA text and figures are generally CC BY 4.0 — [IEA terms](https://www.iea.org/terms)), GEM.wiki (CC BY 4.0) and one Argus Media article citing Kpler data (a single figure quoted with citation). One share is marked as an unsourced analyst estimate.
- **Licence:** the table is our analysis; reuse it freely with a citation of this project and of the source on each row. The underlying reports keep their own terms.
- **Scenario CSV exports** from the map's Share menu are derived analysis (BACI imports × these shares); each file header cites every input.

### Basemap — OpenFreeMap / OpenMapTiles / OpenStreetMap

- **Terms:** [OpenFreeMap](https://openfreemap.org/) (free, no key; MIT-licensed project), tiles built with the [OpenMapTiles](https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md) schema (design CC BY 4.0) from [OpenStreetMap](https://www.openstreetmap.org/copyright) data (ODbL).
- **What we ship:** nothing — the browser loads the style and tiles from OpenFreeMap at runtime. MapLibre's attribution control shows the required credit on the map.

## Using the downloads

1. Keep the attribution line(s) above with any data you reuse (the Share menu's CSV/GeoJSON exports put them in the file header for you).
2. Say that the data was processed by this project (and cite it via [`CITATION.cff`](CITATION.cff)), so readers know it is not the publisher's original release.
3. Check the publisher's current terms if you plan commercial use or wide redistribution.

Questions or a licence concern? Open an issue on [GitHub](https://github.com/narendranag/global-energy-map/issues).
