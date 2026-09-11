# Worked examples

Five research questions, each answered step by step on <https://energymap.marain.space>. Every number below was computed from the files currently in `public/data/` by reproducing the scenario engine (`src/lib/scenarios/engine.ts` and its refinery and LNG-terminal modules) and the panel's ranking rules; `trade_flow.parquet` sha256 `1058bf48…`, after the BACI quantity repair. If the data are refreshed the site will show different numbers — see [Citing and reuse](citing-and-reuse.md#versions-and-as-of-dates).

Crude volumes are BACI tonnes converted at 7.33 barrels per tonne and shown as annual-average kb/d; LNG volumes are million tonnes (Mt). Percentages are "% at risk" as defined in [Scenario method](scenario-method.md).

---

## 1. How exposed is Central Europe to a Druzhba cut? (2022)

**Open:** <https://energymap.marain.space/?mode=scenarios&year=2022&commodity=oil&scenario=druzhba&layers=reserves,pipelines,refineries,lng_terminals&lon=20&lat=50&z=4>

**What to look at.** The country fills (red ramp) and the *Top importers at risk* list; switch the list to *Volume*; then *Top refineries at risk* and *Route shares used*.

**Result, 2022.** Five importers are ranked; 613 kb/d of crude imports are at risk in total.

| Importer | % at risk | At risk / total crude imports |
|---|---|---|
| Slovakia | 95.1 % | 104 of 110 kb/d |
| Hungary | 83.4 % | 100 of 119 kb/d |
| Czechia | 59.7 % | 84 of 140 kb/d |
| Poland | 21.3 % | 111 of 520 kb/d |
| Germany | 14.4 % | 215 of 1,495 kb/d |

By volume the order is Germany, Poland, Slovakia, Hungary, Czechia. The largest refineries at risk by capacity are, as named in the data, Mol Szazhalombatta (Hungary, 134 of 161 kb/d), Mol Slovnaft Bratislava (105 of 110 kb/d) and the two Ceska Rafinerska plants at Litvinov and Kralupy (Czechia).

**How to read it.** The route shares are per importer: 100 % of Russian crude for Belarus, Slovakia, Hungary and Czechia; 47 % for Poland and Germany (the northern branch's ~500 kb/d spread pro rata over their November 2021 Russian imports; the rest came by sea). A country below 100 % either has a partial share (Poland, Germany) or buys non-Russian crude as well (Czechia: 84 of its 140 kb/d came from Russia). Countries that import Russian crude by sea — France, Italy, the Netherlands — have no Druzhba share and show 0 %; type one into *Check a country* to see the explanation.

**Caveats that apply.**

- **Belarus is missing.** BACI records no Russia → Belarus crude trade from 2022 onward (in 2022 Belarus shows only a small Azerbaijani flow). Druzhba's largest customer therefore drops out. Compare 2021 (change `year=2021`): Belarus is first at 96.7 % (314 of 325 kb/d) and six importers are ranked with 866 kb/d at risk.
- **Shares are static.** The 47 % for Germany and Poland reflects late 2021. Both countries wound down Russian pipeline crude from 2022; BACI records 458 kb/d Russia → Germany in 2022 and 2 kb/d in 2023, so the 2022 figure applies a 2021 routing split to a year of transition.
- **Refinery attribution is by capacity within the country.** Germany's exposure is spread over the 10 of its 27 refinery rows that have a capacity in the source, in proportion to capacity. PCK Schwedt, the refinery Druzhba actually feeds, is in the data without a capacity, so it receives no attribution and is not ranked. Read the German refinery rows as "Germany's exposure, apportioned", not as plant-level supply.

---

## 2. Who loses most if Hormuz closes? (2024, crude)

**Open:** <https://energymap.marain.space/?mode=scenarios&year=2024&commodity=oil&scenario=hormuz&layers=reserves,pipelines,refineries,lng_terminals&lon=80&lat=22&z=2.5>

**What to look at.** The ranked importers under both *Share* and *Volume*; the amber Iran note; the seven route shares.

**Result, 2024.** 32 importers are ranked. 12,657 kb/d is at risk, 27.9 % of all crude imports recorded in BACI for 2024.

| By share | % at risk | At risk / total | | By volume | At risk | % at risk |
|---|---|---|---|---|---|---|
| Pakistan | 78.2 % | 156 / 199 kb/d | | China | 3,518 kb/d | 33.8 % |
| Philippines | 77.1 % | 100 / 130 kb/d | | India | 1,877 kb/d | 38.6 % |
| Japan | 73.3 % | 1,721 / 2,347 kb/d | | Japan | 1,721 kb/d | 73.3 % |
| South Korea | 61.9 % | 1,699 / 2,743 kb/d | | South Korea | 1,699 kb/d | 61.9 % |
| Malaysia | 51.7 % | 250 / 484 kb/d | | United States | 533 kb/d | 7.9 % |
| Taiwan | 46.1 % | 491 / 1,067 kb/d | | Taiwan | 491 kb/d | 46.1 % |

Thailand (44.8 %), Poland (44.2 %), Serbia (41.7 %) and Greece (39.2 %) follow on share. On the refinery list, Japanese plants dominate capacity at risk (ExxonMobil Kawasaki 434 of 592 kb/d), with Reliance Jamnagar and ExxonMobil Singapore also near the top.

**How to read it.** The two orderings answer different questions: *share* is dependence (Japan relies on the Gulf for most of its crude), *volume* is scale (China imports the most Gulf crude but also buys heavily elsewhere). Saudi Arabia (88 % through Hormuz) contributes 5,464 kb/d of the at-risk total, Iraq (90 %) 3,136, the UAE (65 %) 2,390, Kuwait 971 and Qatar 674.

**Caveats that apply.**

- **Iran is invisible.** BACI records Iranian crude exports of roughly 0 in 2023 and 2024 (one near-zero pair each year), and far less than in the mid-2010s from 2019 onward (e.g. 81 kb/d in 2020, 629 kb/d in 2022). Buyers of Iranian crude — above all China — are therefore **understated**. Crude reported under another origin is attributed to that origin, whatever its real source.
- **Iraq's share is the long-run 0.90**, which allows for the northern Kirkuk–Ceyhan route; that line was shut in 2023–24, so Iraqi exposure in those years is slightly understated.
- **Saudi and UAE bypasses are fixed at their 2025 use** (Yanbu, Fujairah). The model does not ask whether the East–West or Habshan–Fujairah pipelines could carry more in a closure.
- **Intra-Gulf trade is not exposed, and inbound trade is not counted.** Cargoes between Gulf states never pass the strait, so those pairs have share 0 (since 2026-09-11; before that, Kuwait's crude to Qatar counted, which is why Kuwait's contribution fell from 993 to 971 kb/d). Imports *into* the Gulf from outside do cross the strait but are out of scope.
- **Quantities were repaired.** Before the repair, BACI's reported quantity for UAE → Thailand crude in 2024 was about 6.5× the value-consistent figure; Thailand no longer ranks second by volume. See [Data and coverage](data-and-coverage.md#things-that-will-mislead-you).

---

## 3. How exposed are LNG importers to Hormuz? (2023)

**Open:** <https://energymap.marain.space/?mode=scenarios&year=2023&commodity=gas&scenario=hormuz&layers=reserves,lng_terminals,lng_voyages&lon=80&lat=25&z=2>

With `commodity=gas` the Hormuz scenario uses its LNG shares (Qatar 100 %, UAE 100 %: LNG has no bypass) and BACI HS 271111. The voyage arcs turn red towards exposed terminals.

**Result, 2023.** BACI records 377.0 Mt of LNG imports; 70.6 Mt (18.7 %) is at risk. Qatar's BACI exports are 65.4 Mt and the UAE's 5.2 Mt. Sixteen importers are ranked:

| Importer | % at risk | At risk / total |
|---|---|---|
| Pakistan | 85.3 % | 4.8 of 5.7 Mt |
| India | 64.1 % | 13.9 of 21.8 Mt |
| Italy | 41.4 % | 4.9 of 11.8 Mt |
| Belgium | 37.0 % | 3.0 of 8.1 Mt |
| Singapore | 24.8 % | 1.3 of 5.3 Mt |
| Thailand | 24.6 % | 2.8 of 11.3 Mt |
| China | 24.4 % | 17.3 of 71.0 Mt |
| Taiwan | 22.0 % | 3.8 of 17.1 Mt |
| South Korea | 20.5 % | 9.0 of 44.0 Mt |

Japan, the second-largest LNG importer, is at 5.7 % (3.8 of 66.0 Mt).

**Terminals.** Of the 239 LNG import terminals, 189 were in service in 2023; the other 50 were commissioned later or are still under construction and take no share. Of the 189, 105 are *measured* (they received qualifying LNG-T3 voyages in 2023), 78 are *no voyages* (their country is covered but they are not), and 6 are *capacity proxy*. 46 terminals are ranked, 44 of them measured. The top rows by capacity at risk are Incheon (South Korea, 44.8 %, 24.4 of 54.5 Mtpa), Pyeongtaek and Tongyoung (South Korea), Shandong (China) and Sodegaura (Japan).

**How to read it.** A country's percentage comes from its **BACI** suppliers; a *measured* terminal's percentage comes from the **supplier mix of the voyages** LNG-T3 observed arriving there. The two can disagree: Sodegaura (Japan) shows 17.7 % although Japan as a whole is at 5.7 %. Treat the terminal split as indicative of *where within a country* the exposure sits, not as a second estimate of the country total.

**Caveats that apply.**

- **LNG-T3 is partial.** In 2023 it covers 41 % of GIIGNL's reported world LNG trade (22–41 % across 2020–2024). It is used only for within-country shares, never for volumes — but a terminal can be marked *no voyages* simply because its cargoes were not captured.
- **Kuwait is at 0 % both ways.** BACI records Kuwait's 2023 LNG imports from the US, Nigeria and others but none from Qatar, so Kuwait as a country is at 0 %. LNG-T3 observed 37 Qatari cargoes into Al Zour, but those load and discharge inside the Gulf, so the Qatar→Kuwait pair has share 0 and Al Zour is at 0 % too (it showed 73.4 % before 2026-09-11). Jebel Ali in the UAE keeps only its non-Gulf supply.
- **Terminals must be in service.** A terminal takes a share only if it received cargoes that year, or was commissioned by then and is not under construction.

---

## 4. Which pipelines existed in 1995?

**Open:** <https://energymap.marain.space/?mode=infrastructure&year=1995&commodity=oil&layers=pipelines,gas_pipelines&lon=40&lat=45&z=2.5>

Then change `year=1995` to `year=2024` (or press play from 1995) and compare.

**What is drawn in 1995.**

| | In the data | Start year ≤ 1995 | Start year > 1995 (hidden) | No start year (drawn anyway) | Drawn in 1995 |
|---|---|---|---|---|---|
| Oil (crude, NGL) | 1,185 | 275 | 485 | 425 | 700 |
| Gas | 2,772 | 481 | 1,577 | 714 | 1,195 |

Of the 1,895 lines on the 1995 map, **1,139 (60 %) have no start year** and are there only because undated features are shown in every year.

**How to read it.** Hover a line: dated lines show "Start year: …"; undated ones show no start year. The dated subset (756 lines ≤ 1995) is the defensible answer to "what existed"; the undated remainder is "may or may not have existed". To work with the list, open **Share / cite → Download → Oil pipelines / Gas pipelines (CSV or GeoJSON)**: the export contains exactly the lines drawn for the selected year, with `start_year` blank where unknown.

**Caveats that apply.**

- **Survivorship.** The source is a 2025 (oil) / 2026 (gas) snapshot of operating and in-construction lines. Pipelines retired before then are not in the data, so the 1995 map omits lines that did exist.
- **In-construction lines.** 27 oil and 116 gas lines that are under construction today have no start year and are drawn in 1995 too (their status is in the tooltip).
- **Geometry is schematic** (simplified to about 500 m). Do not measure routes at street scale.
- **Start years from GEM** are the tracker's; expansions and re-routings are not separate events.

---

## 5. Where did Qatar's LNG go in 2023?

**Open:** <https://energymap.marain.space/?mode=flows&year=2023&commodity=gas&layers=gas_pipelines,lng_terminals,lng_voyages&lon=70&lat=25&z=2>

**What to look at.** Arcs leaving Qatar; hover them for terminal, dates, cargo and confidence. There is no exporter filter on the map, so for a table use **Share / cite → Download → LNG voyages (CSV)** and filter `from_country_iso3 = QAT`.

**Result, 2023.** The layer shows laden voyages with confidence ≥ 3 (of 5) that were under way at any point in 2023. From Qatar that is **465 voyages** carrying about **38.5 Mt** (at 0.4245 t/m³), to **42 terminals in 22 countries**. In LNG-T3 all of them load at a single terminal name, "Rasgas LNG Terminal 3", so the arcs fan out from one point.

| Destination | Voyages | ≈ Mt | | BACI: Qatar → destination, Mt |
|---|---|---|---|---|
| China | 111 | 10.1 | | 16.6 |
| Pakistan | 55 | 3.4 | | 4.8 |
| South Korea | 29 | 3.1 | | 8.6 |
| Kuwait | 37 | 3.0 | | not recorded |
| India | 32 | 2.9 | | 10.9 |
| Belgium | 35 | 2.5 | | 3.0 |
| Taiwan | 34 | 2.1 | | 3.6 |
| Italy | 2 | 0.1 | | 4.9 |

**How to read it.** The voyages are a **sample of routes**. For *how much* went where, use BACI (the right-hand column; Qatar's recorded 2023 exports total 65.4 Mt, about 1.7× what the qualifying voyages carry). For *which terminals and when*, use the voyages.

**Caveats that apply.**

- **Coverage is uneven, not just partial.** Italy took 4.9 Mt of Qatari LNG in BACI but only 2 qualifying voyages appear; India's voyage count is also low relative to BACI. Absence of an arc is not evidence of absence of trade.
- **"In 2023" means under way in 2023.** A voyage from December 2022 to January 2023 is counted in both years (191 of the 2,030 qualifying voyages active in 2023, from all exporters, cross a year boundary). Summing a year's arcs slightly double-counts across years.
- **Confidence filter.** 104 further Qatari voyages active in 2023 have confidence 1–2 and are not drawn.
- **Tonnage is approximate.** 0.4245 t/m³ is a display convention; real LNG density varies (about 0.41–0.46).

---

## Adapting these examples

Change `year`, `scenario` or `commodity` in any link above. Before relying on a number, run through the checks in [Scenario method → How to sanity-check a result](scenario-method.md#how-to-sanity-check-a-result), and cite the view with **Share / cite** ([Citing and reuse](citing-and-reuse.md)).
