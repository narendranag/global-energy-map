# Short posts — drafts only, nothing scheduled or sent

Three platforms, three variants each, plus a Hacker News title + first comment. All reference the current **live** feature set: eleven disruption scenarios (chokepoints and pipelines, closable at partial severity, two combined, from either side of the cut), trade-flow arcs, the country panel, search, embed mode and `/query` — all live at https://energymap.marain.space.

---

## LinkedIn (≤ 1,200 characters)

### Variant 1 — the question it answers

Who loses supply when a chokepoint closes or a pipeline is cut? I built a free, inspectable model of oil and gas dependency to answer that: pick any of eleven disruptions — Hormuz, Malacca, Suez + SUMED, Bab el-Mandeb, the Turkish Straits, or six pipelines including Druzhba, BTC and CPC — and see which importers, exporters, refineries and LNG terminals are exposed, and by how much.

If Hormuz closed, on 2024's trade: Japan's crude imports would be 73.3% at risk (1,721 of 2,347 kb/d), but China's 3,518 kb/d is the larger absolute number. Same data, one click apart.

Runs entirely in your browser, no backend, no account. Every number traces to a cited source (Energy Institute, Global Energy Monitor, CEPII BACI, NETL, LNG-T3), and every scenario states its trade year and route-share year, with a caveat when they're far apart — including where the trade data goes blind (Iranian crude, Russia→Belarus after 2022).

Built for energy-policy researchers and IR/economics people who want to interrogate the system, not just look at a picture of it.

https://energymap.marain.space

Feedback and error reports welcome — I'd rather hear about a wrong number now.

(1,164 characters)

### Variant 2 — the honesty angle

Most energy maps show you infrastructure. This one also tells you what the data can't.

Global Energy Map (energymap.marain.space) is an inspectable model of oil and gas dependency: eleven chokepoint and pipeline disruptions, modelled as exposure shares of a country's crude or LNG imports, sourced from CEPII's BACI trade data.

Every scenario states two vintages in its own headline, not one — "Close Suez Canal + SUMED — 2024 trade, 2019 route shares" is the shape of it — with a flag when the routing document is three-plus years older than the trade, and a "Data behind this result" disclosure listing every input's vintage and source.

The same honesty runs through the numbers: Iranian crude is nearly invisible in the trade record after 2019 (sanctioned cargoes get relabelled), Russia→Belarus crude vanishes from 2022, reserves are frozen at 2020 because the Energy Institute hasn't republished them since. A "why 0%?" lookup gives a surprising absence an explanation, not a shrug.

Free, no account, runs in-browser off versioned Parquet with generated licence/checksum metadata — nothing hand-maintained to drift out of sync.

https://energymap.marain.space

(1,168 characters)

### Variant 3 — short and direct

Who loses supply when a chokepoint closes or a pipeline is cut? New: a free, inspectable model of oil and gas dependency — eleven disruption scenarios (Hormuz, Malacca, Suez + SUMED, Bab el-Mandeb, the Turkish Straits, and six pipelines), closable at partial severity or two combined — over a map of pipelines, refineries, LNG terminals and reserves.

Every number cites its source and states its own vintage — trade year and route-share year both, not just one. Free, no account, runs entirely in your browser.

Built for energy-policy and IR/economics researchers.

https://energymap.marain.space

Errors and critique welcome — open an issue from the map itself.

(664 characters)

---

## X / Bluesky (≤ 280 characters)

### Variant 1

Who loses supply if a chokepoint closes or a pipeline is cut? Free, inspectable model of oil/gas dependency — 11 disruption scenarios, partial closures, two combined — over pipelines, refineries, LNG, reserves. Every number cited, every vintage stated.
energymap.marain.space

(255 characters)

### Variant 2

If Hormuz closed, on 2024's trade: Japan 73.3% of crude imports at risk, China the largest volume (3,518 kb/d). Same free map, one click apart — plus the caveat that Iranian crude barely shows up in trade data since 2019.
energymap.marain.space

(234 characters)

### Variant 3

Where did Qatar's LNG go in 2023? A free, inspectable model of oil/gas dependency — pipelines, refineries, reserves, LNG voyages, 11 disruption scenarios. Cited, source-linked, runs entirely client-side off versioned Parquet.
energymap.marain.space

(233 characters)

### Optional 4-post thread

1/ Who loses supply when a chokepoint closes or a pipeline is cut? I built a free, inspectable model of oil and gas dependency to answer that: energymap.marain.space. The map underneath — pipelines, refineries, LNG terminals, reserves — is the evidence, not the headline.

2/ Eleven disruption scenarios: chokepoints (Hormuz, Malacca, Suez + SUMED, Bab el-Mandeb, Turkish Straits) and pipelines (Druzhba, BTC, CPC, Keystone, Enbridge Mainline, ESPO's Skovorodino-Mohe spur). Closable at partial severity, two combined, either side of the cut.

3/ Every scenario states two vintages in its headline — trade year and route-share year — and flags it when they're far apart, plus known blind spots: Iranian crude nearly invisible in trade data since 2019, Russia→Belarus crude gone from 2022, reserves frozen at 2020.

4/ Every fact traces to a cited public source — Energy Institute, Global Energy Monitor, CEPII BACI, NETL, LNG-T3 — with generated licence/checksum metadata on /data. Found something wrong? Open an issue from the map's own error panel. energymap.marain.space

---

## Hacker News — "Show HN"

### Title

Show HN: Global Energy Map – an inspectable model of oil/gas dependency, no backend

### First comment

Who loses supply when a chokepoint closes or a pipeline is cut? I built this to answer that precisely: energymap.marain.space.

The technical shape may be of interest here: there's no backend. Data ships as versioned Parquet files served as static assets with immutable caching; the browser reads them directly with `hyparquet` (one fetch per file, decoded once, filtered in memory) — cold load is about 1.2s at 40 Mbps. The map itself is deck.gl running inside MapLibre via `MapboxOverlay({interleaved: true})`, so deck's data layers (points, choropleths, animated arcs) composite beneath the basemap's own labels on one canvas.

DuckDB-WASM is bundled and self-hosted (sha256-pinned, no CDN dependency) but deliberately kept off the main load path — there's a test that asserts no `/duckdb/` request happens on a cold load of `/`. It's loaded only on `/query`, an in-browser SQL console over the same files.

The build-time data pipeline is Python (pandas/geopandas/pyarrow/duckdb) over public sources: Energy Institute reserves, Global Energy Monitor pipelines/terminals/extraction sites (CC BY 4.0), NETL's oil & gas infrastructure database (public domain), CEPII's BACI bilateral trade (Etalab open licence), and an AIS-derived LNG voyage dataset (LNG-T3, CC BY 4.0). Every transform in the pipeline drops its own prior output before re-appending, so a full rebuild is byte-identical across reruns — that made it possible to regenerate a licence/checksum manifest automatically instead of hand-maintaining one.

Eleven disruption scenarios (four chokepoints with a separate oil/LNG route-share set each, the Turkish Straits, and six pipelines) are exposure accounting, not a market model: static route shares (each with its own source citation) applied to a year's bilateral trade volumes, closable individually, at partial severity, two at once, or from either side of the cut. No price response, no rerouting, no strategic-stock drawdown — the docs are explicit about this because I didn't want anyone mistaking a first-order exposure share for a forecast. There's also no year slider: every layer shows its own latest data, a scenario runs on the latest reconciled trade year, and it states both that year and the vintage of the route-share document it used, flagging it when the two are far apart.

Open to critique on the data pipeline, the disruption model's assumptions, or anything that looks wrong on the map itself — code is MIT-licensed, data licences vary by source and are listed per-file.
