# Short posts — drafts only, nothing scheduled or sent

Three platforms, three variants each, plus a Hacker News title + first comment. All reference the **live** feature set (five scenarios: Hormuz oil, Hormuz LNG, Druzhba, BTC, CPC) unless a variant is explicitly marked `[POST-MERGE]`, in which case it also mentions the wider scenario set / trade-flow arcs and must not go out before `post-launch-ux-scenarios` merges to `main`.

---

## LinkedIn (≤ 1,200 characters)

### Variant 1 — the question it answers

I built a free, interactive map of the world's oil and gas system: reserves, pipelines, refineries, LNG terminals and voyages, 1990–2024, plus disruption scenarios (close the Strait of Hormuz, cut Druzhba, BTC or CPC) that show exactly which importers and refineries are exposed, by how much, and why.

If Hormuz closed in 2024, Japan's crude imports would be 73.3% at risk (1,721 of 2,347 kb/d) — but China's 3,518 kb/d at risk is the larger absolute number. Different questions, same data, one click to switch between them.

It runs entirely in your browser (no backend, no account), every number traces to a cited public source (Energy Institute, Global Energy Monitor, CEPII BACI, NETL, LNG-T3), and every scenario shows its route shares and their caveats in the same view — including where the trade data goes blind (Iranian crude, Russia→Belarus after 2022).

Built for energy-policy researchers and IR/economics people who want to interrogate the system, not just look at a picture of it.

https://energymap.marain.space

Feedback and error reports genuinely welcome — it's a research instrument, and I'd rather hear about a wrong number now.

(1,149 characters)

### Variant 2 — the honesty angle

Most energy maps show you infrastructure. This one also shows you what the data can't tell you.

Global Energy Map (energymap.marain.space) models chokepoint and pipeline disruptions — Hormuz, Druzhba, BTC, CPC — as exposure shares: what fraction of a country's crude or LNG imports moved through a given route, sourced from CEPII's BACI trade data.

Every scenario panel states its blind spots next to the number, not below it: Iranian crude is nearly invisible in the trade record after 2019 (sanctioned cargoes get relabelled), Russia→Belarus crude vanishes from 2022, reserves are frozen at 2020 because the Energy Institute hasn't republished them since. A "why 0%?" lookup exists so a surprising absence gets an explanation instead of a shrug.

Free, no account, runs in-browser off versioned Parquet files with generated licence/checksum metadata — nothing hand-maintained to drift out of sync.

https://energymap.marain.space

(933 characters)

### Variant 3 — short and direct

New: an interactive map of the world's oil and gas system — reserves, pipelines, refineries, LNG terminals, 1990–2024 — with disruption scenarios showing who's exposed if Hormuz, Druzhba, BTC or CPC go down, and by how much.

Every number cites its source. Every scenario states its own blind spots (sanctioned crude that disappears from trade records, reserves frozen at 2020) right next to the result. Free, no account, runs entirely in your browser.

Built for energy-policy and IR/economics researchers.

https://energymap.marain.space

Errors and critique welcome — open an issue from the map itself.

(605 characters)

---

## X / Bluesky (≤ 280 characters)

### Variant 1

Built a free map of the world's oil/gas system: pipelines, refineries, LNG, reserves 1990–2024, + disruption scenarios (Hormuz, Druzhba, BTC, CPC) showing who's exposed & by how much. Every number cited, every blind spot stated. No account, runs in-browser.
energymap.marain.space

(280 characters)

### Variant 2

If Hormuz closed in 2024: Japan 73.3% of crude imports at risk, China the largest volume (3,518 kb/d). Both numbers, same free map, one click apart — plus the caveat that Iranian crude barely shows up in trade data since 2019.
energymap.marain.space

(249 characters)

### Variant 3

Where did Qatar's LNG go in 2023? An interactive, cited, source-linked map — pipelines, refineries, reserves, LNG voyages, disruption scenarios. Free, no account, runs entirely client-side off versioned Parquet.
energymap.marain.space

(234 characters)

### Optional 4-post thread

1/ Built a free, interactive map of the world's oil and gas system for energy-policy and IR researchers: energymap.marain.space. Reserves, pipelines, refineries, LNG terminals and voyages, 1990–2024. No account, no backend — runs entirely in your browser.

2/ It also models disruptions: close the Strait of Hormuz, cut Druzhba, BTC or CPC. Hormuz 2024: Japan 73.3% of crude imports at risk (1,721/2,347 kb/d) by share; China 3,518 kb/d at risk by volume — same data, two different questions.

3/ Every scenario states its own blind spots next to the number: Iranian crude is nearly invisible in the trade record from 2019 (sanctioned cargoes relabelled), Russia→Belarus crude vanishes from 2022, reserves are frozen at 2020 (Energy Institute hasn't republished since).

4/ Every fact traces to a cited public source — Energy Institute, Global Energy Monitor, CEPII BACI, NETL, LNG-T3 — with generated licence/checksum metadata on /data. Found something wrong? Open an issue from the map's own error panel. energymap.marain.space

---

## Hacker News — "Show HN"

### Title

Show HN: Global Energy Map — world oil/gas infrastructure + disruption scenarios, no backend

### First comment

I built this to answer one question precisely: when a pipeline or chokepoint goes down, whose imports actually run through it, and by how much? energymap.marain.space

The technical shape may be of interest here: there's no backend. Data ships as versioned Parquet files served as static assets with immutable caching; the browser reads them directly with `hyparquet` (one fetch per file, decoded once, filtered in memory) — cold load is about 1.2s at 40 Mbps. The map itself is deck.gl running inside MapLibre via `MapboxOverlay({interleaved: true})`, so deck's data layers (points, choropleths, animated arcs) composite beneath the basemap's own labels on one canvas.

DuckDB-WASM is bundled and self-hosted (sha256-pinned, no CDN dependency) but deliberately kept off the main load path — there's a test that asserts no `/duckdb/` request happens on a cold load of `/`. It exists for an in-browser SQL query console.

The build-time data pipeline is Python (pandas/geopandas/pyarrow/duckdb) over public sources: Energy Institute reserves, Global Energy Monitor pipelines/terminals/extraction sites (CC BY 4.0), NETL's oil & gas infrastructure database (public domain), CEPII's BACI bilateral trade (Etalab open licence), and an AIS-derived LNG voyage dataset (LNG-T3, CC BY 4.0). Every transform in the pipeline drops its own prior output before re-appending, so a full rebuild is byte-identical across reruns — that made it possible to regenerate a licence/checksum manifest automatically instead of hand-maintaining one.

Disruption scenarios (Strait of Hormuz, Druzhba, Baku-Tbilisi-Ceyhan, CPC) are exposure accounting, not a market model: static route shares (each with its own source citation) applied to a year's bilateral trade volumes. No price response, no rerouting, no strategic-stock drawdown — the docs are explicit about this because I didn't want anyone mistaking a first-order exposure share for a forecast.

Open to critique on the data pipeline, the disruption model's assumptions, or anything that looks wrong on the map itself — code is MIT-licensed, data licences vary by source and are listed per-file.
