# FAQ

Short answers, with links to the longer explanations.

### Is this suitable for trading, investment or operational decisions?

No. The map is a research and teaching instrument built from annual, lagged, openly licensed data with known gaps. Scenario results are static first-order exposure shares with no price, stock, rerouting or substitution model ([Scenario method](scenario-method.md#what-the-model-deliberately-does-not-do)). Nothing on the site is investment advice or a real-time picture of flows.

### What exactly does "% at risk" mean?

The share of an importer's crude (or LNG) imports in the selected year, by tonnes in CEPII BACI, that came from exporters routed through the chosen chokepoint or pipeline, weighted by each exporter's route share. It describes last year's dependence, not next year's shortfall. See [Scenario method](scenario-method.md#what--at-risk-means).

### Why do reserves stop in 2020?

The Energy Institute's *Statistical Review* (2025 edition) refreshed production to 2024 but has not published country proved reserves after 2020. For 2021–2024 the map shows the 2020 value and flags it beside the year control. Crude production in the tooltips does run to 2024.

### Why is there no coal (or power, or refined products)?

The project started with the oil and gas chain, and coal is a candidate for a later phase (GEM's coal mine and plant trackers are CC BY 4.0 and listed in [Data sources](../data-sources.md#candidate-sources-phase-7)). Refined products and pipeline-gas trade are outside the scenarios by design: the scenarios use HS 2709 (crude) and HS 271111 (LNG) only.

### Why is country X missing?

It depends on where it is missing:

- **Reserves map (grey):** the Energy Institute publishes named figures for about 50 countries (49 for oil, 51 for gas); the rest are inside regional "Other" totals.
- **Map fill but present in tables:** small states and islands (Singapore, Bahrain, Hong Kong, …) have no polygon in the 1:110m country outlines.
- **Scenario list:** importers under 0.1 % of world imports that year, with zero exposure, or with no BACI rows are not listed. Use *Check a country* in the scenario panel to see which.
- **A known flow missing from a scenario:** BACI does not record it — for example Iranian crude exports in 2023–2024, or Russian crude into Belarus from 2022.

### Why does a country show 0 % when I know it depends on the route?

Usually one of: its supplier is not in the scenario's share table; the pipeline share is set for named importers only (France's Russian crude does not ride Druzhba); BACI has no row for that trade in that year; or the country is itself an exporter on the route. Type it into **Check a country (why 0 %?)** for the specific reason.

### Can I get daily or monthly flows?

Not for trade in general: BACI is annual. For LNG, `lng_voyage.parquet` (dated voyages), `lng_trade_daily.parquet` and `lng_terminal_daily.parquet` from LNG-T3 are downloadable from [/data](https://energymap.marain.space/data), covering 2020–2024 — but they are an AIS sample covering 22–41 % of world LNG trade, so they describe routes and timing, not national totals.

### Why do the LNG voyage arcs disagree with the trade totals?

Because they measure different things. BACI gives annual country-to-country quantities; LNG-T3 is a partial AIS sample whose coverage varies by route (e.g. in 2023 it has 2 qualifying Qatar → Italy voyages against 4.9 Mt in BACI). The map uses BACI for all volumes and LNG-T3 only for routes and within-country terminal shares. See [Worked example 5](worked-examples.md#5-where-did-qatars-lng-go-in-2023).

### Do the historical years show what really existed?

Only approximately. Undated features are drawn in every year (60 % of the pipelines on the 1995 map have no start year), and facilities retired before the source snapshot are mostly absent. Refineries, storage, ports and basins have no dates at all. The badges in the Layers panel give the dated share for each layer.

### Why do the route shares not change over time?

Each comes from one document describing one period, and no open source gives exporter-by-route splits for every year since 1995. Year-to-year movement in a scenario comes from trade, not routing. This matters for Iraq in 2023–24, Germany and Poland after 2022, and any year before a route opened. See [Scenario method](scenario-method.md#why-route-shares-are-static).

### Why do some BACI quantities differ from what I get from CEPII?

The project repairs rows whose quantity is implausible given their value (unit value more than 5× away from the median for that HS code and year): 9,655 of 53,727 rows, with BACI's original kept in `qty_reported` and the row flagged `qty_imputed`. See [Data and coverage](data-and-coverage.md#things-that-will-mislead-you).

### How often is the data refreshed?

By hand, following each publisher's cadence: Energy Institute annually (around June), BACI annually (around January–February), GEM and LNG-T3 per release, NETL ad hoc, OpenStreetMap quarterly. Each file's as-of date is on [/data](https://energymap.marain.space/data); every change is logged in the [data changelog](../refresh.md#data-changelog). There is no live or automatic feed.

### Can I download everything I see?

Everything except the Energy Institute reserves/production series and the asset table's 88 OpenStreetMap refinery rows. Use `assets_open.parquet` for the rest of the asset table. See [Citing and reuse](citing-and-reuse.md#what-you-can-download).

### How do I cite a figure made from the map?

Use **Share / cite → Cite this view**, which gives an APA reference with the view URL and access date plus every source behind the view. Cite the underlying publishers too. See [Citing and reuse](citing-and-reuse.md).

### Can I run it offline or on my own data?

The code is MIT-licensed and the data build is reproducible with `uv run python -m scripts.build_all` ([Citing and reuse](citing-and-reuse.md#reproducing-the-data-build)). To serve the app locally, `pnpm install` and `pnpm dev` in a clone. Adding a source follows the recipe in [Data sources](../data-sources.md#how-to-add-a-new-source).

### How do I report an error?

Open an issue at <https://github.com/narendranag/global-energy-map/issues>. Please include the view URL (Share / cite → Link to this view), what you expected, and your source for the expected value.
