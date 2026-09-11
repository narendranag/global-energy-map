# Getting started

A guided tour of the interface at <https://energymap.marain.space>. For what the numbers mean, see [Scenario method](scenario-method.md) and [Data and coverage](data-and-coverage.md).

## First load

The map opens in **Infrastructure** mode, year **2020**, commodity **oil**, centred on the Middle East (longitude 40, latitude 25, zoom 2). 2020 is the default because it is the last year with a live reserves value.

On a first visit an introduction card offers four example questions. Each one sets the whole view (mode, year, commodity, scenario, layers):

- How exposed is Central Europe to a Druzhba cut? (2022)
- Who loses most if Hormuz closes? (2024, crude)
- Where did Qatar's LNG go in 2023?
- Which pipelines existed in 1995?

All four are worked through in [Worked examples](worked-examples.md). The card does not come back once dismissed (the choice is kept in your browser's local storage).

The header holds the three mode tabs, a "Loading N layers…" indicator, and on the right **Share / cite**, **Methodology** and **Data**.

## The three modes

A mode is a starting point: choosing one switches on a preset set of layers and, where needed, moves the commodity or year. You can change any layer afterwards.

| Mode | Layers switched on | Other changes when you select it |
|---|---|---|
| **Infrastructure** — what exists, and when | Reserves, oil pipelines, gas pipelines, refineries, LNG terminals | Clears any active scenario. The Layers list starts expanded. |
| **Flows** — where LNG cargoes went, 2020–2024 | Gas pipelines, LNG terminals, LNG voyages | Commodity → gas. Year → 2023 unless it is already within 2020–2024. Clears any scenario. |
| **Scenarios** — close a chokepoint or cut a pipeline | Reserves, oil pipelines, refineries, LNG terminals | If the year is before 1995 (no trade data), it moves to 2024. Keeps a scenario you already chose. |

Scenarios keeps the Reserves layer on because the exposure colours are drawn on the country fills.

## Commodity: oil or gas

The Oil / Gas toggle (centred above the year slider) changes:

- the reserves choropleth (proved oil reserves in billion barrels, or proved gas reserves in trillion cubic metres);
- the scenarios offered (oil: Hormuz, Druzhba, BTC, CPC; gas: Hormuz only);
- the trade code the scenario reads (crude, HS 2709; or LNG, HS 271111) and whether refineries or LNG import terminals are ranked.

## Layers and time-aware badges

The Layers panel (top left) groups toggles under **Geology** (reserves, basins), **Oil** (extraction sites, oil pipelines, refineries, storage hubs, ports) and **Gas** (gas pipelines, LNG terminals, LNG voyages). Each layer carries a badge saying how it responds to the year control; hover the badge for a one-line explanation.

| Layer | Badge | Meaning |
|---|---|---|
| Reserves (country) | time: to 2020 | Yearly values 1990–2020; 2021–2024 show the 2020 value |
| Basins | static | No dates in the source |
| Extraction sites | time: 22 % | Start year known for 22 % of sites; undated sites show in every year |
| Oil pipelines | time: 64 % | Start year known for 64 %; undated lines show in every year |
| Refineries | static | No commissioning dates |
| Storage hubs | static | No dates; drawn from zoom 4 upward |
| Ports | static | No dates; drawn from zoom 4 upward |
| Gas pipelines | time: 74 % | Start year known for 74 % |
| LNG terminals | time: 98 % | Start year known for 98 % |
| LNG voyages | time: 2020–24 | Only exists for 2020–2024; empty in other years |

A "partial" badge means the map **over-states** what existed in early years: every undated feature is drawn in every year. The Legend sits under the layer list and adds the exposure ramp while a scenario is active.

## The year control

The slider at the bottom runs **1990–2024**. Use the arrows for ±1 year, the play button to step one year every 0.7 s (it stops at 2024), or the keyboard (←/→, Page Up/Down, Home/End) once the slider has focus.

Things to keep in mind:

- **Reserves stop in 2020.** With the Reserves layer on and a year after 2020, an amber note beside the year reads "Reserves: 2020 value (latest in EI Statistical Review)". Nothing that changes on the choropleth after 2020 is a change in reserves.
- **Scenario trade data start in 1995.** There is nothing to put at risk in 1990–1994.
- **LNG voyages exist only for 2020–2024.** A voyage is shown in every year it is under way, so a December–January voyage appears in both years.

## Hovering: value, year and source

Hover any country, pipeline, terminal, refinery or voyage for a tooltip. Every tooltip ends with a **source line** — "Source: *publisher* (as of *date*)" — taken from the data catalogue, so you always know which release a value comes from. Where a value is missing in the source the tooltip says "not in source" (capacity) or "n/a" (text fields); it never shows a missing value as zero.

- **Countries** show proved reserves with the year the value refers to; for 2021–2024 they add "(latest in source; year selected: …)". With a scenario active they also show the country's exposure and the BACI source.
- **Pipelines** show commodity, status, operator, capacity (kb/d for oil, bcm/y for gas) and start year where known.
- **Refineries and LNG terminals** show capacity and, under a scenario, their attributed exposure and top historical suppliers.
- **LNG voyages** show loading and discharge terminals, dates, cargo in cubic metres (with an approximate tonnage at 0.4245 t/m³) and the LNG-T3 confidence score.

## The scenario panel

In Scenarios mode (or whenever a scenario is set) a panel opens on the right. From top to bottom:

1. **Scenario picker and description.** For Hormuz (oil, 2019 onwards) an amber note warns that BACI records little Iranian crude, so exposure of Iran's buyers is understated; for Druzhba (2022 onwards) it warns that Belarus is missing from BACI.
2. **Metric definition.** "% at risk = share of each importer's *year* crude imports (BACI, by volume) routed through *route*", with the 0–100 % colour ramp. **How this is computed** expands to the steps the engine follows for the current scenario, commodity and year.
3. **Top importers at risk.** The six highest, then **Show all**. The **Share / Volume** toggle re-orders the list by percentage or by volume at risk. Volumes are in kb/d for crude (annual average, 7.33 barrels per tonne) and Mt per year for LNG. Ranking rules:
   - importers with zero exposure are omitted;
   - importers whose total imports are **under 0.1 % of world imports** of that commodity in that year are omitted from the list and not shaded on the map (their tooltip says so) — without this floor a country buying a few hundred tonnes at 100 % would outrank Japan;
   - BACI's non-country aggregate codes are dropped.
4. **Top refineries / Top LNG import terminals at risk.** Ranked by **capacity at risk** (share at risk × nameplate capacity, in kb/d or Mtpa). Assets with no capacity in the source are not ranked — for refineries that is 70 % of rows. For LNG terminals each row carries a badge:
   - **measured** — the terminal's share of its country's imports and its supplier mix come from LNG-T3 voyages (2020–2024);
   - **capacity proxy** — no voyage coverage in that country (or a year before 2020): the BACI country total is split by terminal capacity;
   - **no voyages** — the country has voyage coverage but this terminal received no qualifying voyage: a data gap, not zero risk.
5. **Route shares used.** Every share the scenario applied (exporter → importer or "all importers", and the percentage), with a link to the source document and its year. **How this share follows from the source** expands to the derivation. Shares without a supporting document carry an amber **Analyst estimate (unsourced)** badge.
6. **Check a country (why 0 %?).** Type a country name or ISO3 code. The panel explains the result in one or two sentences: the country is exposed (and through which suppliers); it is an *exporter* on the route (the scenario measures importers, not lost sales); BACI records no imports for it that year; it buys from route exporters but not along the route (e.g. a pipeline share set only for named importers); or none of its suppliers use the route.

## Share / cite

**Share / cite** in the header opens a panel with three sections:

- **Link to this view** — the full URL, including mode, year, commodity, scenario, layers and map position.
- **Cite this view** — three formats: *View + sources* (an APA reference with the view URL and access date, a summary of the view, the source and as-of date of every visible layer and the scenario, and the required attribution lines), *APA*, and *BibTeX*.
- **Download** — the **scenario table** as CSV (every importer with imports, plus refinery or terminal rows, in tonnes, with a header citing each input), and **CSV / GeoJSON** for each visible layer whose sources all permit redistribution. Reserves (Energy Institute) and refineries (which include OpenStreetMap rows) are view-only; the voyages export is available only for 2020–2024. Layer exports respect the year, so a pipelines export in 1995 contains the lines drawn in 1995.

See [Citing and reuse](citing-and-reuse.md) for what to do with these.

## Methodology and Data pages

- **[/methodology](https://energymap.marain.space/methodology)** renders [`docs/methodology.md`](../methodology.md): per layer and per scenario, source, as-of, coverage, units, gaps; the route-share table; licences; how to cite.
- **[/data](https://energymap.marain.space/data)** lists every shipped file with source, licence, as-of date, rows, size and sha256, and a download button where the licence permits.

## Shareable URLs

The address bar always reflects the current view, so you can bookmark or paste it. Parameters:

| Parameter | Values | Notes |
|---|---|---|
| `mode` | `infrastructure`, `flows`, `scenarios` | Missing or unknown → Infrastructure. The mode's preset only fills parameters the URL does not give. |
| `year` | integer | Rounded and clamped to 1990–2024. |
| `commodity` | `oil`, `gas` | Unknown → the mode default. |
| `scenario` | `hormuz`, `druzhba`, `btc`, `cpc` | Unknown → none. Hormuz with `commodity=gas` is the LNG scenario. |
| `layers` | comma-separated: `reserves`, `basins`, `extraction`, `pipelines`, `refineries`, `storage`, `ports`, `gas_pipelines`, `lng_terminals`, `lng_voyages` | Replaces the preset entirely; `layers=` switches everything off. |
| `lon`, `lat` | decimal degrees | Longitude wrapped to −180…180; latitude clamped to ±85.05; two decimals kept. |
| `z` | zoom 0–8 | Clamped; the data are not useful beyond zoom 8. |

Example (the Druzhba question):

```
https://energymap.marain.space/?mode=scenarios&year=2022&commodity=oil&scenario=druzhba&layers=reserves,pipelines,refineries,lng_terminals&lon=20&lat=50&z=4
```

A URL fixes the **view**, not the **data**: if a source is refreshed, the same link computes on the new data. To pin numbers, also keep the scenario CSV or note the file hashes on /data (see [Citing and reuse](citing-and-reuse.md#versions-and-as-of-dates)).
