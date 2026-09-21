# Global Energy Map: an inspectable model of who depends on what, in oil and gas

*Draft for a personal site / Substack post. Word count ~900. Every number below is checked against the live data as of 2026-09-19 — see `docs/announce/fact-check.md` for the exact command or file behind each one.*

**DO NOT PUBLISH YET.** All 11 scenarios, trade-flow arcs, the country panel, search, embed mode, the scenario severity/combine/exporter-view controls and `/query` are now live at https://energymap.marain.space (checked 2026-09-21 — see `CLAUDE.md`). This draft is still held pending the maintainer's own decision to send it out; publish only when they say so.

---

**Who loses supply when a chokepoint closes or a pipeline is cut?** I built an open, inspectable model of oil and gas dependency to answer that precisely, not just gesture at it: [energymap.marain.space](https://energymap.marain.space). Pick one of eleven disruptions — a strait, a canal, a pipeline — and see which importers, exporters, refineries and LNG terminals are exposed, by how much, and from which source. The map underneath it — reserves, extraction, pipelines, refineries, LNG terminals and voyages, storage and ports — is the evidence the model is computed from, not the headline.

It's free, needs no account, and runs entirely in your browser — there's no backend, no API key, no database server. Every fact on it traces to a public, cited source, and every number states the year it's from.

## Three things you can check yourself

**1. Who loses the most crude if the Strait of Hormuz closes, in 2024?**

[Open this view](https://energymap.marain.space/?mode=scenarios&year=2024&commodity=oil&scenario=hormuz&layers=reserves,pipelines,refineries,lng_terminals&lon=80&lat=22&z=2.5)

By share of a country's own crude imports: Pakistan 78.2%, the Philippines 77.1%, Japan 73.3% (1,721 of 2,347 kb/d), South Korea 61.9% (1,699 of 2,743 kb/d). By raw volume the ranking flips: China's 3,518 kb/d at risk (33.8% of its imports) is the largest single number on the list, ahead of India's 1,877 kb/d (38.6%). Those are two different questions — dependence versus scale — and the map lets you switch between them rather than picking one for you.

The honest caveat sits right next to the number: Iranian crude exports are close to zero in the trade data for 2023–2024 (sanctioned cargoes get relabelled — Malaysia is a common one), so China, Iran's main buyer, is *understated* here, not overstated. The panel says this in the same breath as the ranking, not in a footnote you have to go looking for.

One more thing worth saying plainly: these are 2024 structural exposures — "how much of each country's trade *would be* at risk, based on last measured pattern of that trade" — not a live read of the strait today. EIA data show Hormuz was effectively closed for weeks in early 2026 (the Congressional Research Service dates Iran's declared closure to February 28–April 7, 2026, after Iran-Israel strikes), and the map does not attempt to model that: it pins to the pre-crisis structural baseline, the same convention every other scenario on it uses.

**2. How exposed is Central Europe to a Druzhba cut, in 2022 — the year it would have mattered?**

[Open this view](https://energymap.marain.space/?mode=scenarios&year=2022&commodity=oil&scenario=druzhba&layers=reserves,pipelines,refineries,lng_terminals&lon=20&lat=50&z=4)

Slovakia 95.1% (104 of 110 kb/d), Hungary 83.4% (100 of 119 kb/d), Czechia 59.7% (84 of 140 kb/d), Poland 21.3%, Germany 14.4%. The map also tells you what's *missing*: Belarus, Druzhba's largest single customer, drops out of the 2022 result entirely, because the trade data records no Russian crude reaching Belarus from 2022 onward. Compare 2021, where Belarus tops the list at 96.7%, to see the gap open up.

**3. Where did Qatar's LNG actually go in 2023?**

[Open this view](https://energymap.marain.space/?mode=flows&year=2023&commodity=gas&layers=gas_pipelines,lng_terminals,lng_voyages&lon=70&lat=25&z=2)

AIS-tracked voyages show cargoes reaching China, Pakistan, South Korea, Kuwait, India, Belgium, Taiwan and Italy. Qatar's total recorded exports for the year were 65.4 million tonnes; the ship-tracking sample used here captures about 38.5 Mt of that at confidence ≥ 3 of 5 — a *sample of routes*, not a census of trade, and it says so on the same screen.

## What it's built from

Reserves and production from the Energy Institute's Statistical Review; extraction sites, pipelines and LNG terminals from Global Energy Monitor (CC BY 4.0); refineries, basins, storage and ports from the US DOE's NETL (public domain), filled out with OpenStreetMap where NETL has nothing (ODbL); LNG voyages from LNG-T3, an AIS-derived academic dataset (CC BY 4.0); bilateral trade from CEPII's BACI (Etalab Open Licence 2.0). Every layer's licence, as-of date and file checksum is machine-generated onto a `/data` page and a `/methodology` page — nobody hand-maintains that list, so it can't drift out of sync with what's actually shipped.

Most of it is downloadable under its original licence. Two things aren't: the Energy Institute's reserves series (their terms don't allow bulk republication) and the small slice of the asset table that comes from OpenStreetMap (its share-alike licence would otherwise force the whole table into ODbL) — that table ships separately, minus the OSM rows, so the rest stays freely downloadable.

## What it can't tell you

No prices, no market model, no rerouting or substitution — a scenario result is *last year's exposure*, not a forecast. Route shares (what fraction of a country's exports uses a given chokepoint) are static single numbers pinned to whichever year the source report describes, not something the model re-derives every year. Reserves are frozen at 2020 because the Energy Institute hasn't republished them since. The trade data itself has known blind spots: Iranian crude and Russia→Belarus crude both effectively vanish from the record once sanctions relabeling and rerouting begin. LNG-T3's ship-tracking sample covers 22–41% of world LNG trade depending on the year and route — real, but partial. UN Comtrade's monthly import figures, used only as a supplementary near-real-time view, don't include China or Taiwan, because neither reports monthly.

None of this is buried. Every hover shows a source and an as-of date; every scenario panel lists the route shares it used and the document behind each one; a "why 0%?" lookup exists specifically so a surprising absence has an explanation instead of a shrug. There's no year slider implying the map tracks 2026 in real time: every layer shows its own latest data, a scenario runs on the latest reconciled trade year, and it states that year alongside the vintage of the routing document behind the route share it used — with a visible flag when the two are several years apart. A "Data behind this result" disclosure lists every input's vintage and source document, and an old `?year=` link still works and says so with an "as of" chip.

The scenario set covers eleven disruptions over fifteen oil/gas route-share sets: four chokepoints with a separate oil and LNG share each — Hormuz, Malacca, Suez + SUMED, Bab el-Mandeb — plus the Turkish Straits, and six pipelines — Druzhba, Baku-Tbilisi-Ceyhan, CPC, Keystone, the Enbridge Mainline and the ESPO pipeline's Skovorodino-Mohe spur. Each is closable individually, at partial severity, two at once (reported as a range, not a false-precision sum), and viewable from either side of the cut — who loses supply, or who loses the outlet. A per-country panel adds that country's exposure to every scenario in one place; a trade-flow layer draws BACI's bilateral crude and LNG arcs directly on the map instead of only in the scenario tables; search finds any country, pipeline or terminal by name; an embed mode drops the map into another page with its attribution intact; and `/query` runs SQL over the same Parquet files in your browser, for anyone who wants to ask a question the interface didn't anticipate.

## Citing it, and finding what's wrong with it

Cite the map: Nag, N. (2026). *Global Energy Map* (Version 1.0.0) [Computer software]. https://energymap.marain.space — or use Share → Cite this view for a reference to the exact scenario, year and layers you're looking at, with every source behind it listed. `CITATION.cff` has the full reference list.

If you find an error — in a number, a source, or a claim about what the data shows — [open an issue](https://github.com/narendranag/global-energy-map/issues); the map's own error panel pre-fills one for you. I'd rather hear about a wrong figure from a researcher than have it sit uncorrected on a public map.
