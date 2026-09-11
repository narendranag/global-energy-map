# Global Energy Map — guide for researchers

**Live map:** <https://energymap.marain.space> (the older `global-energy-map-one.vercel.app` address redirects there).

This guide is for academics, energy-policy analysts and IR/economics scholars who want to use the map as an instrument rather than a picture: to see how the world's oil and gas system is wired, how it changed between 1990 and 2024, and which importers, refineries and LNG terminals depend on a given chokepoint or pipeline. It explains what the numbers mean, where they come from, and where they stop being informative.

The map is free, needs no account, and runs entirely in your browser: the Parquet data files are fetched from the site and decoded in the page (no database server, no SQL sent anywhere), and no request goes to any data provider while you use it.

## What the map can answer

- **Where is the infrastructure, and roughly when was it built?** Oil and gas pipelines, refineries, LNG export and import terminals, extraction sites, storage sites, ports and petroleum basins, with a year control from 1990 to 2024. Some layers are dated (LNG terminals 98 %, gas pipelines 74 %, oil pipelines 64 %, extraction sites 22 %); others are present-day snapshots.
- **Who holds proved reserves?** Country-level oil and gas reserves, 1990–2020 (Energy Institute Statistical Review).
- **Where did LNG cargoes go in 2020–2024?** AIS-derived voyage arcs from the LNG-T3 dataset — a sample of routes, not a census of trade.
- **Who is exposed if a route closes?** Five disruption scenarios (Strait of Hormuz for crude, Strait of Hormuz for LNG, Druzhba, Baku–Tbilisi–Ceyhan, Caspian Pipeline Consortium) give, for any year 1995–2024, each importer's share of crude or LNG imports that moved through the route, and attribute that exposure to refineries or LNG import terminals.
- **What exactly is behind a number?** Every hover shows the source and as-of date; every scenario lists the route shares it used with the document behind each; every view can be cited and most layers exported.

## What it cannot answer

- **Prices, markets or welfare.** There is no price, elasticity, or GDP model. A scenario result is a first-order exposure share, not a forecast of shortage or cost.
- **Adaptation.** Scenarios do not reroute cargoes, draw on strategic stocks, use spare pipeline capacity, or substitute suppliers. See [the scenario method](scenario-method.md#what-the-model-deliberately-does-not-do).
- **Sub-annual dynamics.** Trade data are annual (CEPII BACI). The LNG voyages carry dates, but they are used for routes and within-country shares only.
- **Refined products, pipeline gas trade, coal or power.** Scenarios cover crude (HS 2709) and LNG (HS 271111) only. Coal is not on the map.
- **Throughput and utilisation.** Pipelines and terminals carry nameplate capacity where the source has it; there are no measured flows except the LNG-T3 sample.
- **Reserves after 2020.** The Energy Institute has not published country reserves beyond 2020; later years show the 2020 value.
- **A complete historical map.** Undated features are drawn in every year and retired facilities are mostly absent, so early years show too much and the wrong things. See [Data and coverage](data-and-coverage.md).

## Pages in this guide

| Page | Read it when you want to… |
|---|---|
| [Getting started](getting-started.md) | learn the interface: modes, layers, the year control, hovering, the scenario panel, Share / cite, and the URL parameters |
| [Worked examples](worked-examples.md) | follow five research questions end to end, with exact links, computed numbers and the caveats that apply |
| [Scenario method](scenario-method.md) | understand what "% at risk" means, where route shares come from, what the model leaves out, and how to check a result yourself |
| [Data and coverage](data-and-coverage.md) | know, layer by layer, the source, as-of date, coverage, units, time behaviour and known biases |
| [Citing and reuse](citing-and-reuse.md) | cite the map, a specific view and the underlying sources; download and verify files; rebuild the data |
| [FAQ](faq.md) | get short, direct answers to common questions |

## Other references

- [Methodology](../methodology.md) — the current-state methodology, also rendered on the site at [/methodology](https://energymap.marain.space/methodology).
- [Data sources](../data-sources.md) — the source inventory, including sources evaluated and rejected.
- [Data licences](../../LICENSE-DATA.md) — licence, attribution line and restrictions for every source.
- [Refresh runbook](../refresh.md) — how and when each source is updated, and the data changelog.
- [Data page](https://energymap.marain.space/data) — every shipped file with licence, as-of date, rows, size, sha256 and (where permitted) a download link.
- [Terms of use](https://energymap.marain.space/terms) and [Privacy](https://energymap.marain.space/privacy) — linked from the footer of every page.

## Reporting problems

If a number looks wrong, a source is mis-cited, or a country is missing, open an issue at <https://github.com/narendranag/global-energy-map/issues>. Include the view URL (Share / cite → Link to this view) so the exact state can be reproduced.
