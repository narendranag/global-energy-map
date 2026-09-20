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

The header holds the three mode tabs, the search box, a "Loading N layers…" indicator, and on the right **Share / cite**, **Methodology**, **Data** and **Query**.

## The three modes

A mode is a starting point: choosing one switches on a preset set of layers and, where needed, moves the commodity or year. You can change any layer afterwards.

| Mode | Layers switched on | Other changes when you select it |
|---|---|---|
| **Infrastructure** — what exists, and when | Reserves, oil pipelines, gas pipelines, refineries, LNG terminals | Clears any active scenario. The Layers list starts expanded. |
| **Flows** — who bought crude and LNG from whom | Gas pipelines, LNG terminals, Trade flows (BACI crude/LNG arcs) | Commodity → gas. Year → 2024 unless it is already within BACI's 1995–2024 coverage. Clears any scenario. |
| **Scenarios** — close a chokepoint or cut a pipeline | Reserves, oil pipelines, refineries, LNG terminals | If the year is before 1995 (no trade data), it moves to 2024. Keeps a scenario you already chose. |

Trade flows and LNG voyages both draw arcs for the same commodity and read as double vision together, so Flows opens with Trade flows (country-pair BACI arcs, annual) rather than LNG voyages (terminal-to-terminal LNG-T3 tracking, 2020–2024) — turn LNG voyages on separately from the Layers panel for the voyage-level view.

Scenarios keeps the Reserves layer on because the exposure colours are drawn on the country fills.

## Commodity: oil or gas

The Oil / Gas toggle (centred above the year slider) changes:

- the reserves choropleth (proved oil reserves in billion barrels, or proved gas reserves in trillion cubic metres);
- the scenarios offered (oil: all 11 — Hormuz, Malacca, Suez + SUMED, Bab el-Mandeb, Turkish Straits, Druzhba, Baku-Tbilisi-Ceyhan, CPC, Keystone, Enbridge Mainline, the ESPO pipeline's Skovorodino-Mohe spur; gas/LNG: Hormuz, Malacca, Suez + SUMED and Bab el-Mandeb only — the pipeline scenarios and Turkish Straits have no LNG route data);
- the trade code the scenario reads (crude, HS 2709; or LNG, HS 271111) and whether refineries or LNG import terminals are ranked.

## Layers and time-aware badges

The Layers panel (top left) groups toggles under **Geology** (reserves, basins, US shale regions), **Oil** (extraction sites, oil pipelines, refineries, storage hubs, ports), **Gas** (gas pipelines, LNG terminals, LNG voyages, EU gas storage) and **Trade** (recent imports, trade flows). Each layer carries a badge saying how it responds to the year control; hover the badge for a one-line explanation.

| Layer | Badge | Meaning |
|---|---|---|
| Reserves (country) | time: to 2020 | Yearly values 1990–2020; 2021–2024 show the 2020 value |
| Basins | static | No dates in the source |
| US shale regions | time: 2009–25 | Annual crude + gas production, Permian/Bakken/Eagle Ford/Haynesville/Appalachia; empty outside 2009–2025 |
| Extraction sites | time: 32 % | Start year known for 32 % of sites; undated sites show in every year |
| Oil pipelines | time: 64 % | Start year known for 64 %; undated lines show in every year |
| Refineries | static | No commissioning dates |
| Storage hubs | static | No dates; drawn from zoom 4 upward |
| Ports | static | No dates; drawn from zoom 4 upward |
| Gas pipelines | time: 74 % | Start year known for 74 % |
| LNG terminals | time: 98 % | Start year known for 98 % |
| LNG voyages | time: 2020–24 | Only exists for 2020–2024; empty in other years |
| Gas storage (EU) | **not** slider-affected | Always the latest AGSI gas day, whatever year is selected; a country whose own feed has gone stale is dropped from the reading rather than shown as current |
| Recent imports (Comtrade) | **not** slider-affected | Each country's own latest 12 reported months, regardless of the selected year |
| Trade flows (BACI) | time: 1995–2024 | Empty outside BACI's coverage; world view draws only the largest 150 country pairs by volume, a focused country draws all of its own pairs above 0.1 % of its trade |

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

## Selecting a country: the country panel

Hovering answers "what is this?"; selecting answers "what is going on here?". **Click a country** — or open a link carrying `focus=ISO3` — and a panel opens on the right with that country read end to end. Clicking it again, clicking empty sea, pressing **Escape** or using the panel's **✕** clears the selection. A click on a pipeline, terminal or refinery is a click on *that*, and leaves the selection alone.

The panel's header carries the country's name and ISO3 code, **Zoom to** (fits the country's bounds, clear of the panels) and **Download CSV**. Below it, in order, and each section present only if the country has data for it:

1. **Reserves and production** — proved reserves (billion barrels of oil, or trillion cubic metres of gas) and crude production in kb/d, each with an inline sparkline over the whole series and a dot on the selected year. The headline number is the value *at* that year; where the series stops earlier the panel says so in words ("2020 value — the Energy Institute has not refreshed reserves since") rather than showing a blank or carrying the last value forward silently. Each sparkline is announced to screen readers as a sentence: span, first and last value, low and high with their years.
2. **Trade in the selected year** — total imports and exports (BACI, kb/d for crude or Mt for LNG), a sparkline of each over 1995–2024, and the top five suppliers and top five customers with their shares. **Every partner row is a button**: selecting one moves the panel to that country, so a supply chain can be walked upstream.
3. **Exposure** — the country's share and volume at risk under *every* scenario that applies to the current commodity, computed on the same engine and the same cited route shares the scenario panel uses, highest first. Selecting a row activates that scenario on the map; the country panel stays open beside it.
4. **Infrastructure, gas storage and recent imports** — counts and summed capacity of LNG terminals, refineries and extraction sites (with how many of them carry a capacity in the source); EU gas-storage fullness on GIE's latest gas day, which is independent of the year slider; and the country's latest 12-month Comtrade import window.

Every section ends with its own source and as-of line, taken from the data catalogue.

**Download CSV** gives exactly what the panel shows, in long format, *minus what may not be redistributed*. The rule is the same one the layer downloads follow: a section ships only if every source behind it is CC BY 4.0, public domain or Etalab. In practice BACI trade, the exposure derived from it and the LNG-terminal and extraction-site counts ship; Energy Institute reserves and production, GIE storage, the Comtrade window and refineries (which mix in ODbL OpenStreetMap rows) do not. The panel names the omissions before you download, and the file repeats them in its `#` header, so an absent section is never mistaken for a zero.

On a narrow screen the panel collapses to a **Country** button, below the Scenario one.

## The scenario panel

In Scenarios mode (or whenever a scenario is set) a panel opens on the right. From top to bottom:

1. **Scenario picker and description.** Eleven scenarios: Hormuz, Malacca, Suez + SUMED, Bab el-Mandeb and Turkish Straits (chokepoints); Druzhba, Baku-Tbilisi-Ceyhan, CPC, Keystone, Enbridge Mainline and the ESPO pipeline's Skovorodino-Mohe spur (pipelines). A second dropdown lets you close a **second scenario at the same time** — the two combine into a range (see below), never simple addition. Where BACI has a known gap the panel shows an amber note: Hormuz (oil, 2019 onwards) for Iranian crude, Malacca (oil, 2019 onwards) for Iranian crude via China, Druzhba (2022 onwards) for Belarus, and ESPO's spur (2022 onwards) for Russian crude reaching China by tanker.
2. **Severity.** A second slider under the year control cuts only part of the route (5–100 %, default 100 = a full closure); every number in the panel scales with it. The context block labels the figure "at N % severity" whenever it is below 100.
3. **Metric definition.** "% at risk = share of each importer's *year* crude imports (BACI, by volume) routed through *route*", with the 0–100 % colour ramp. **How this is computed** expands to the steps the engine follows for the current scenario, commodity, year and severity.
4. **Importers / Exporters view.** A toggle flips the panel and the map's shading to the *exporters'* side of the same cut — who loses the outlet, rather than who loses supply — with its own ranked list, its own CSV export and its own "Check a country" answers, captioned so it is never mistaken for the importer numbers.
5. **Top importers (or exporters) at risk.** The six highest, then **Show all**. The **Share / Volume** toggle re-orders the list by percentage or by volume at risk. Volumes are in kb/d for crude (annual average, 7.33 barrels per tonne) and Mt per year for LNG. Ranking rules:
   - countries with zero exposure are omitted;
   - countries whose total trade is **under 0.1 % of world trade** of that commodity in that year are omitted from the list and not shaded on the map (their tooltip says so) — without this floor a country trading a few hundred tonnes at 100 % would outrank Japan;
   - BACI's non-country aggregate codes are dropped.
6. **Two scenarios combined.** When a second scenario is active the headline number is a **range**: the lower bound (barrels that would be cut either way — the same cargo counted once even if it crosses both routes) up to the upper bound (barrels cut only if both routes close, added together). The lower bound is always the headline figure and is shown alone wherever the two ends round to the same number; it is the larger of the two single-scenario figures, never smaller.
7. **Top refineries / Top LNG import terminals at risk.** Ranked by **capacity at risk** (share at risk × nameplate capacity, in kb/d or Mtpa). Assets with no capacity in the source are not ranked — for refineries that is 70 % of rows. For LNG terminals each row carries a badge:
   - **measured** — the terminal's share of its country's imports and its supplier mix come from LNG-T3 voyages (2020–2024);
   - **capacity proxy** — no voyage coverage in that country (or a year before 2020): the BACI country total is split by terminal capacity;
   - **no voyages** — the country has voyage coverage but this terminal received no qualifying voyage: a data gap, not zero risk.
8. **Route shares used.** Every share the scenario applied (exporter → importer or "all importers", and the percentage), with a link to the source document and its year. **How this share follows from the source** expands to the derivation. Shares without a supporting document carry an amber **Analyst estimate (unsourced)** badge.
9. **Check a country (why 0 %?).** Type a country name or ISO3 code. The panel explains the result in one or two sentences: the country is exposed (and through which suppliers); it is an *exporter* on the route (the scenario measures importers, not lost sales); BACI records no imports for it that year; it buys from route exporters but not along the route (e.g. a pipeline share set only for named importers); or none of its suppliers use the route.
10. **Context (gas scenarios only).** For Hormuz, Malacca, Suez and Bab el-Mandeb on the gas axis, a "Context" block beside the ranked list shows each exposed importer's current EU gas-storage cover (a live AGSI reading, in "days of the at-risk LNG volume" — a scale comparison, never a forecast) and, for the top exposed importers generally, a UN Comtrade recency check against the same year's BACI figure. Both are honesty checks, never a second exposure computation, and neither ever rides along in the scenario CSV.

## Share / cite

**Share / cite** in the header opens a panel with three sections:

- **Link to this view** — the full URL, including mode, year, commodity, scenario, layers and map position.
- **Cite this view** — three formats: *View + sources* (an APA reference with the view URL and access date, a summary of the view, the source and as-of date of every visible layer and the scenario, and the required attribution lines), *APA*, and *BibTeX*.
- **Download** — the **scenario table** as CSV (every importer with imports, plus refinery or terminal rows, in tonnes, with a header citing each input), and **CSV / GeoJSON** for each visible layer whose sources all permit redistribution. Reserves (Energy Institute) and refineries (which include OpenStreetMap rows) are view-only; the voyages export is available only for 2020–2024. Layer exports respect the year, so a pipelines export in 1995 contains the lines drawn in 1995.

See [Citing and reuse](citing-and-reuse.md) for what to do with these.

## Search

The header search box (a country, pipeline, refinery, extraction site, LNG terminal, basin or US shale region) is lazy: nothing it needs is fetched until you focus or type into it. Matching is case- and diacritic-insensitive, an exact ISO3 code wins outright, a prefix match beats a substring match, and countries rank first among equal-tier matches. Selecting a result flies the camera there and, for anything but a country, drops a brief highlight ring; a country becomes the current `focus` and opens the country panel. The search text itself is never written to the URL.

## The other site pages

- **[/methodology](https://energymap.marain.space/methodology)** renders [`docs/methodology.md`](../methodology.md): per layer and per scenario, source, as-of, coverage, units, gaps; the route-share table; licences; how to cite.
- **[/data](https://energymap.marain.space/data)** lists every shipped file with source, licence, as-of date, rows, size and sha256, and a download button where the licence permits.
- **[/query](https://energymap.marain.space/query)** is a SQL console over the same files: DuckDB-WASM (loaded only on this page, never on the map) with every catalog file registered as a table, a schema sidebar, six worked example queries, a shareable `?q=` link, and a CSV export that is only offered when every table your query touches is separately downloadable. See [Query console](query-console.md).
- **[/terms](https://energymap.marain.space/terms)** and **[/privacy](https://energymap.marain.space/privacy)** — terms of use (including the no-warranty and not-for-operational-decisions statement, governed by Singapore law) and the privacy notice. They are linked from the footer on every page, along with the provenance line.

## Shareable URLs

The address bar always reflects the current view, so you can bookmark or paste it. Parameters:

| Parameter | Values | Notes |
|---|---|---|
| `mode` | `infrastructure`, `flows`, `scenarios` | Missing or unknown → Infrastructure. The mode's preset only fills parameters the URL does not give. |
| `year` | integer | Rounded and clamped to 1990–2024. |
| `commodity` | `oil`, `gas` | Unknown → the mode default. |
| `scenario` | `hormuz`, `malacca`, `suez`, `bab_el_mandeb`, `turkish_straits`, `druzhba`, `btc`, `cpc`, `keystone`, `enbridge_mainline`, `espo_spur` | Unknown → none. A scenario with `commodity=gas` that has no LNG route data (the pipelines, Turkish Straits) is dropped rather than shown at a false 0 %. |
| `scenario2` | Same set as `scenario` | A second scenario closed at the same time. Dropped if there is no primary, if it repeats the primary, or if the commodity axis does not model it. Never `scenario=a+b` — `scenario` always names exactly one id. |
| `sev` | integer, 5–100 | Severity: the percentage of the route(s) cut. Omitted at 100 (a full closure, every link shared before this existed). Out-of-range or unparseable values clamp into range rather than inventing or erasing exposure. |
| `view` | `importers`, `exporters` | Which side of the cut the panel and map shading describe. Omitted at `importers` (the default every earlier link means). |
| `layers` | comma-separated: `reserves`, `basins`, `extraction`, `pipelines`, `refineries`, `storage`, `ports`, `gas_pipelines`, `lng_terminals`, `lng_voyages`, `gas_storage`, `shale_regions`, `recent_imports`, `trade_flows` | Replaces the preset entirely; `layers=` switches everything off. |
| `focus` | ISO3 code | The selected country: outlines it and opens the country panel. A code we hold no polygon for is ignored. Written only while a country is selected, so older links are unchanged. |
| `lon`, `lat` | decimal degrees | Longitude wrapped to −180…180; latitude clamped to ±85.05; two decimals kept. |
| `z` | zoom 0–8 | Clamped; the data are not useful beyond zoom 8. |
| `embed` | `1` | Embed mode: hides the header, intro card, phone banner and full footer behind a compact attribution bar. A view flag, not part of the shareable view above — "Copy link" never adds it, so a normal shared link is unaffected. Add `&controls=0` to also hide the year slider and commodity toggle. |
| `q` | base64url-encoded SQL | `/query` only: the SQL behind a result, shareable the same way a map view is. |

Example (the Druzhba question):

```
https://energymap.marain.space/?mode=scenarios&year=2022&commodity=oil&scenario=druzhba&layers=reserves,pipelines,refineries,lng_terminals&lon=20&lat=50&z=4
```

A URL fixes the **view**, not the **data**: if a source is refreshed, the same link computes on the new data. To pin numbers, also keep the scenario CSV or note the file hashes on /data (see [Citing and reuse](citing-and-reuse.md#versions-and-as-of-dates)).
