# The scenario method, in plain language

The scenarios answer one narrow question: **if a route were closed, what share of each country's imports in a given year had been moving along it?** This page explains how that number is built, what it assumes, and how to check it. The formal statement is in [Methodology → Disruption scenarios](../methodology.md#disruption-scenarios); the code is `src/lib/scenarios/` (`engine.ts`, `refinery.ts`, `lng.ts`, `lng-t3.ts`).

## What "% at risk" means

For a scenario (a chokepoint or a pipeline), a commodity (crude or LNG) and a year:

```
at risk (importer)   = Σ over exporters X of  imports(X → importer, year) × share(route, X, importer)
% at risk (importer) = at risk (importer) ÷ total imports (importer, year)
```

- **imports** are annual bilateral quantities in tonnes from CEPII BACI: HS 2709 (crude petroleum) for the oil scenarios, HS 271111 (liquefied natural gas) for Hormuz-LNG. Pipeline gas (HS 271121) is excluded because it never crosses a chokepoint.
- **share** is the fraction of exporter X's shipments to that importer that travel along the route.
- **total imports** is everything the importer bought of that commodity that year, from every supplier.

A small worked case: in 2022 BACI records 110 kb/d of crude imports into Slovakia, 104 kb/d of it from Russia. Druzhba's share for Russia → Slovakia is 1.0, and no other supplier has a Druzhba share, so Slovakia's at-risk volume is 104 kb/d and its % at risk is 104 ÷ 110 = 95.1 %.

It is a **static, first-order exposure measure**: the share of last year's supply that used the route. It is not a forecast of lost supply, of prices, or of welfare. Volumes are displayed as kb/d for crude (7.33 barrels per tonne, annual average) and Mt for LNG; the computation itself stays in tonnes.

The measure is about **importers**. Exporters on the route (Saudi Arabia for Hormuz, Kazakhstan for CPC) are not scored on their lost sales; their own, usually tiny, imports are scored like anyone else's. The *Check a country* box says so when you type an exporter.

## Route shares

Every scenario is driven by a small hand-set table, `disruption_route.parquet` (18 rows), in which each share is tied to a document. The panel's **Route shares used** list shows the rows for the active scenario with their citations; **How this share follows from the source** gives the arithmetic.

| Scenario | Exporter → importer | Share | Source (year) |
|---|---|---|---|
| Hormuz (crude) | Saudi Arabia → all | 0.88 | Argus Media, citing Kpler data (2026) |
| | Iraq → all | 0.90 | IEA, *Strait of Hormuz* (2026) |
| | UAE → all | 0.65 | IEA, *Strait of Hormuz* (2026) |
| | Iran, Kuwait, Qatar, Bahrain → all | 1.00 | IEA, *Strait of Hormuz* (2026) |
| Hormuz (LNG) | Qatar, UAE → all | 1.00 | IEA, *Strait of Hormuz* (2026) |
| Druzhba | Russia → Belarus | 1.00 | GEM.wiki, *Druzhba Oil Pipeline* (2026) |
| | Russia → Slovakia, Hungary, Czechia | 1.00 | IEA, *Russian supplies to global energy markets* (2022) |
| | Russia → Poland, Germany | 0.47 | IEA, *Russian supplies to global energy markets* (2022) |
| BTC | Azerbaijan → all | 0.83 | EIA, *Caspian Sea* regional brief (2025) |
| CPC | Kazakhstan → all | 0.80 | EIA, *Caspian Sea* regional brief (2025) |
| | Russia → all | 0.035 | **Analyst estimate (unsourced)** |

Two kinds of share:

- **Chokepoint shares (Hormuz)** are set once per exporter and apply to every buyer — a Gulf producer's bypass capacity does not depend on who the cargo is for.
- **Pipeline shares** are set per importer where the pipeline serves named countries (Druzhba), or per exporter where it carries a fixed fraction of all exports (BTC, CPC). A pair-specific share wins over an exporter-wide one; exporters with no share contribute nothing.

**How strong is each row?** Read the derivation notes before relying on a scenario:

- **Directly quoted:** BTC 0.83 and CPC–Kazakhstan 0.80 are EIA's own percentages.
- **Computed from quoted volumes:** Saudi Arabia 0.88 (≈ 5.5 mb/d via Hormuz vs ≈ 0.76 mb/d via Yanbu), UAE 0.65 (2.02 mb/d via Hormuz vs ≈ 1.1 mb/d via Fujairah), the Druzhba southern-branch 1.0s (≈ 250 kb/d branch vs 240 kb/d of Russian imports into Hungary, Slovakia and Czechia), and Poland/Germany 0.47 (≈ 500 kb/d northern branch allocated **pro rata** across their November 2021 Russian imports, because the IEA gives no split).
- **Structural reasoning, cited for context:** Belarus 1.0 (landlocked, refineries pipeline-fed; rail volumes not quantified), LNG Qatar and UAE 1.0 (loading terminals inside the Gulf, no alternative), and the 1.0s for Iran, Kuwait, Qatar and Bahrain (the IEA says they rely on the strait for the "vast majority" of exports).
- **Partly outside the cited source:** Iraq 0.90 — the northern-route volume used to set it is not from the IEA document.
- **Unsourced:** Russia → CPC 0.035, derived from CPC throughput minus Kazakh volumes against total Russian crude exports. It is flagged in the panel.

Six shares were revised to source-derived values on 2026-09-10; the old values are recorded in each row's note.

## Why route shares are static

Each share comes from a document describing one period (mostly 2021–2025). The same share is applied to every year from 1995 to 2024, because no open source gives exporter-by-route splits year by year. The consequences are predictable and worth checking whenever you move the year:

- **Routes that changed.** Kirkuk–Ceyhan was shut in 2023–24 (Iraq's true share was close to 1.0 then); Germany and Poland largely ended Russian pipeline crude after 2022, but the 0.47 still applies to whatever Russian volume BACI records.
- **Routes that did not exist yet.** The GEM pipeline data give start years of 2006 for Baku–Tbilisi–Ceyhan, 2001 for the Caspian Pipeline and 2012 for the Habshan–Fujairah bypass, yet a BTC scenario for 1998 still applies 0.83 to Azerbaijan's exports, and a Hormuz scenario for 2005 still lets 35 % of UAE crude bypass the strait. Scenario years before a route opened are not meaningful.
- **Changes in the trade data carry the story.** Year-to-year movement in a result comes from BACI (who bought what from whom), never from the route.

## Refinery attribution (oil scenarios)

Each country's imports, and its at-risk imports, are split across its refineries in proportion to capacity:

```
refinery share = capacity(refinery) ÷ Σ capacity of refineries in the same country
```

If no refinery in the country has a known capacity, the split is even. If some do, those without capacity get nothing. Capacity is known for 350 of 1,163 refineries (30 %), so in many countries a handful of large plants carry the whole national figure. Every refinery in a country therefore shows the **same % at risk** — the country's — and the ranking by capacity at risk mostly reflects size. Real feedstock depends on contracts, crude quality, ownership and logistics, none of which is public at this resolution. Refineries in net exporters (Saudi Arabia, Russia) show little or nothing because the model only sees imports.

## LNG import-terminal attribution (Hormuz-LNG)

The **country total always comes from BACI.** How it is split across that country's import terminals depends on the year:

- **2020–2024, country covered by LNG-T3 voyages.** Voyages are filtered to laden (export) voyages with confidence ≥ 3 that were under way in the year. Each covered terminal gets a share of the BACI country total in proportion to the cubic metres it received, and its % at risk is computed from the **exporters of the voyages it received**. Terminals in a covered country with no qualifying voyage are marked **no voyages** — a data gap, not zero risk. → badge **measured**.
- **2020–2024, country not covered; and every year before 2020.** The BACI total is split by terminal capacity. → badge **capacity proxy**.

LNG-T3 covers 22–41 % of world LNG trade (per GIIGNL, 2020–2024), so it is used only for shares within a country, never for volumes. Because the terminal percentage comes from the voyage mix and the country percentage from BACI, the two can differ; see [Worked example 3](worked-examples.md#3-how-exposed-are-lng-importers-to-hormuz-2023).

**Asset set.** Refinery and terminal attribution uses every refinery and import terminal in the data, whatever the scenario year — including terminals under construction today or commissioned after that year. The map layers hide not-yet-built terminals; the attribution does not.

## What the model deliberately does not do

- **No price response.** Nothing about prices, elasticities, or demand destruction.
- **No rerouting or spare capacity.** A closed route's volume is not moved to the Yanbu or Fujairah bypass, to tankers, or to another pipeline beyond the fixed share.
- **No stocks.** Strategic petroleum reserves, commercial inventories and floating storage are ignored; there is no notion of how long a disruption lasts.
- **No substitution.** Importers do not switch suppliers, and exporters do not redirect cargoes.
- **No product trade.** Refined products, NGLs and pipeline gas are outside the scenarios; so is re-export of refined crude.
- **No exporter losses.** Lost revenue or shut-in production for route exporters is not computed.
- **No geography inside a route.** An exporter-wide share applies to every buyer, including intra-Gulf buyers whose cargoes never pass Hormuz.

These are choices, not oversights: each would need data (monthly flows, spare capacity, stocks) or behavioural assumptions that cannot be sourced openly and cited row by row.

## How to sanity-check a result

1. **Read the shares.** Open *Route shares used*: which exporters are in the scenario, at what share, from which document and year? A result can only be as good as the least certain share contributing to it.
2. **Ask why.** Type the country into *Check a country*. It lists the suppliers carrying the exposure and their volumes, or says why the answer is zero (no BACI imports, not on the route, or an exporter).
3. **Look at the trade rows.** Download `trade_flow.parquet` from [/data](https://energymap.marain.space/data). Check the importer's suppliers for the year; check `qty_imputed` (quantities re-estimated from value because BACI's quantity was implausible; the original is in `qty_reported`) and the implied unit value `value_usd / qty`. Missing reporters (Iran from 2023; Russia → Belarus from 2022) show up as absent rows.
4. **Move the year.** A jump from one year to the next should be explainable by trade (a new supplier, sanctions, a reporting gap). A jump that coincides with a known route change is *not* captured, because shares are static.
5. **Compare to a published figure carefully.** The Hormuz crude scenario puts 27.9 % of 2024 world crude imports (as recorded in BACI) at risk. Published statements about Hormuz usually refer to total oil (crude and products) or to seaborne trade, so the denominators differ; the comparison checks the order of magnitude, not the digit.
6. **Recompute it.** Download the **scenario table** (Share / cite → Download → Scenario table): every importer's `total_qty`, `at_risk_qty` and `share_at_risk` in tonnes, with the inputs cited in the header. Or reproduce the importer figures directly with DuckDB (Python `duckdb` package or the CLI) from the two downloadable files:

```sql
WITH r AS (
  SELECT exporter_iso3, importer_iso3, share
  FROM 'disruption_route.parquet' WHERE disruption_id = 'hormuz'   -- 'hormuz_lng' for LNG
),
t AS (
  SELECT importer_iso3, exporter_iso3, COALESCE(qty, 0) AS qty
  FROM 'trade_flow.parquet' WHERE hs_code = '2709' AND year = 2024  -- '271111' for LNG
)
SELECT t.importer_iso3,
       SUM(t.qty) AS total_t,
       SUM(t.qty * COALESCE(p.share, w.share, 0)) AS at_risk_t,
       at_risk_t / total_t AS share_at_risk
FROM t
LEFT JOIN r p ON p.exporter_iso3 = t.exporter_iso3 AND p.importer_iso3 = t.importer_iso3
LEFT JOIN r w ON w.exporter_iso3 = t.exporter_iso3 AND w.importer_iso3 IS NULL
GROUP BY 1
ORDER BY at_risk_t DESC;
```

This returns every importer; the panel additionally drops importers below 0.1 % of world imports, zero-exposure importers and non-country codes. For Japan in 2024 it gives 0.733, the panel's 73.3 %.
