---
id: odp-energy-context-spike
title: "Spike: energy-price and flow context through OpenBB ODP"
order: 2
summary: A one-day trial of OpenBB's Open Data Platform (V5, free providers) as a source of price, production, stock and chokepoint-traffic context for the map — what worked, each provider's licence, refresh cadence, and the recommendation not to merge it as is.
status: provisional
updated: 2026-10-15
audience: [maintainer]
depends_on: [overview]
related: []
defines: [odp, portwatch]
answers:
  - Can ODP's free providers supply price and flow context for the map?
  - Which of those series may the public repo or site redistribute?
  - How fresh is each series, and how often does it change?
  - Should the spike be merged?
---

# Spike: energy-price and flow context through OpenBB ODP

Branch `spike/odp-energy-prices`, run on `mini` on 2026-10-15. Prompted by the explore note `~/projects/explore/open-data-platform/open-data-platform.md`. Its best use case was "energy price context for global-energy-map" (EIA and JODI series beside the map's volumes), scored 3/5.

## Recommendation

**Follow-up (2026-10-15): PortWatch shipped.** At the maintainer's direction, and without waiting for the IMF's reply, chokepoint transits went live as a direct ingest (`scripts/ingest/portwatch_chokepoints.py`, no ODP), view-only, in the scenario panel's Context block. See `docs/methodology.md` → Scenario context.

**Decision (maintainer, 2026-10-15): merged.** As an academic, non-commercial project the map takes the leeway that gives it: the spike's code is on `main`, the data stays out of the repo, and permission for showing PortWatch on the site is being asked of the IMF. The spike's own recommendation, kept below for the record, was not to merge it as is.

The spike's reasoning:

- **ODP works, but it isn't what makes the data usable.** It reached all four free sources in an afternoon with no paid key. But each source is a single HTTP endpoint, and the project already has a direct EIA client (`scripts/ingest/eia_steo.py`). ODP saves the client code and costs a ~700 MB dependency. V5 is two weeks old (2026-09-30), from a steward that changed hands in September.
- **Licensing is the wall, as it was for paid data** (`commercial-data-options.md`). Every price and traffic series here rests on vendor data: Refinitiv, Argus or Kpler. None qualifies as downloadable under `LICENSE-DATA.md`. Showing them view-only needs a yes from the IMF first, and from the IEF for JODI.
- **The find worth keeping is IMF PortWatch's daily chokepoint transits.** It is observed traffic, by day, at exactly the chokepoints the scenarios model. It shows Hormuz tanker transits falling from about 50 a day to about 1 a day from March 2026. That is the context the scenario panel lacks. Pursue it as a **direct** ingest, with no ODP, shown view-only through the existing `ScenarioContext` pattern, after asking copyright@imf.org.

Keep ODP on `mini` as a discovery tool. That is how PortWatch was found.

## What was run

- **Install:** `uv add --group odp openbb`. This is an opt-in dependency group, so CI's `uv sync --locked` never installs it. It took 14 s and brought in openbb 5.0.0 and openbb-core 2.0.1, with 19 providers including `jodi`, `us_eia`, `imf`. pandas 3.0.3, pyarrow and duckdb stayed at their pins.
- **Script:** `scripts/ingest/odp_energy_context.py`. It pulls four sources from 2019-01-01 and normalises them into one long table: `source, series_id, iso3, scenario_id, date, frequency, value, unit`. Rows carry `iso3` for the country panel or `scenario_id` for the scenario panel. Raw frames go to `data/raw/odp/` and the table to `data/derived/odp/energy_context.parquet`, both gitignored. The full pull took about 2 min, 95 s of it PortWatch, and produced 51,893 rows.
- **`latest_vs_trailing()`** is how the map would use a series: the latest value against its trailing mean. From the real pull:
  - Brent averaged $102/bbl in September 2026 (IMF), 28% above its 12-month mean.
  - Hormuz tanker transits were 1 a day on 11 Oct.
  - Saudi crude was 8,135 kb/d in July 2026, 9% below its 12-month mean.
- **Tests:** `tests/python/test_odp_energy_context.py`, 9 tests on a **synthetic** fixture (`tests/python/fixtures/odp/`). It keeps the real columns, codes, names and dates, but every value is invented, because no series here is cleanly redistributable. The tests need neither ODP nor the network.
- **Incidental fix:** the `odp` group installs plotly, whose `.venv/.../plotly.min.js` exhausted ESLint's heap. `.venv/` is now in `eslint.config.mjs`'s ignores. That fix is worth keeping whatever happens to the spike.

| Source (ODP call) | Series | Key | Latest point on 15 Oct | Result |
| --- | --- | --- | --- | --- |
| IMF PCPS (`obb.imf.indicators`, `PCPS::…`, `transform="USD"`) | Brent, WTI, Dubai, Henry Hub, EU gas, Asia LNG, Australian coal, monthly | none | Sep 2026 | ✅ 651 rows |
| EIA (`obb.eia.petroleum.prices.spot_prices`, `…natural_gas_spot_and_futures_prices`) | Brent `RBRTE`, WTI `RWTC`, Henry Hub `RNGWHHD`, daily | `EIA_API_KEY`, else EIA's public `DEMO_KEY` | 6 Oct 2026 | ✅ 5,855 rows on `DEMO_KEY` |
| JODI (`obb.jodi.oil.production` / `.stocks`, `obb.jodi.gas.production`) | crude production (kb/d), crude stocks (kbbl), gas production (million m³), 13 countries | none | Jul 2026 | ✅ with gaps (below) |
| IMF PortWatch (`obb.imf.chokepoint_volume`) | daily transits (all vessels, tankers) and tanker capacity, for Hormuz, Malacca, Suez, Bab el-Mandeb, Bosporus | none | 11 Oct 2026 | ✅ 14,205 rows per field |

### What the data showed

- **Same name, different instrument.**
  - WTI from EIA (daily, averaged to a month) and IMF agree within 1% in every month.
  - **Brent and Henry Hub do not.** Brent was 46% apart in April 2020 and 12% apart in April and September 2026. Henry Hub was more than 2% apart in 56 of 93 months.
  - EIA's figures are physical spot prices. IMF's appear to be benchmark or futures-based averages; its documentation names Refinitiv and Argus. In a crisis month the spread between the two is the story itself. The map must name one and say which.
- **JODI has gaps the map would have to state.**
  - The UAE returned nothing for any series, and Qatar has no crude production.
  - Russia's crude production stops in March 2023, Iraq's crude in March 2024.
  - India runs to March 2026; the rest run to July 2026.
  - A misspelt country fails loudly: JODI calls Korea `south_korea`, and the guard caught it.
- **PortWatch tanker transits, monthly mean per day:**

  | Month | Hormuz | Malacca | Suez | Bab el-Mandeb | Bosporus |
  | --- | --- | --- | --- | --- | --- |
  | 2025-09 | 49.8 | 84.5 | 16.0 | 11.0 | 23.5 |
  | 2026-02 | 43.5 | 85.6 | 17.4 | 13.8 | 18.8 |
  | 2026-03 | 0.9 | 76.0 | 16.9 | 15.0 | 22.6 |
  | 2026-09 | 1.1 | 70.4 | 15.6 | 8.0 | 14.4 |

  **Caution for the announcement draft:**
  - The draft dates the Hormuz closure 28 Feb–7 Apr 2026, but PortWatch's AIS-derived count stays near zero through 11 Oct.
  - The maintainer confirms the fall is real (2026-10-15). The draft now cites CRS R45281 (closure declared days after US-Israeli strikes began on 28 February 2026, never fully reopened) and EIA STEO August 2026.
  - Multi-source trackers that also see AIS-dark ships (Kpler, Vortexa) reported about 10 vessels a day in September 2026, so PortWatch's count is a lower bound and is shown as one.

## Licences and attribution

Read 2026-10-15 from each provider's own pages. This is not legal advice.

| Source | Terms | Attribution | Third-party carve-out | Fit with `LICENSE-DATA.md` |
| --- | --- | --- | --- | --- |
| **EIA** | Public domain (US Government): "You may use and/or distribute any of our data" (eia.gov/about/copyrights_reuse.php) | "Source: U.S. Energy Information Administration (<release date>)" | Yes: spot prices are "Refinitiv, an LSEG business". Material licensed by companies "requires the written permission of the copyright owners" | Lowest risk; still not cleanly downloadable for `RBRTE`/`RWTC` |
| **IMF PCPS** | IMF data terms (imf.org/en/about/copyright-and-terms): may "download, extract, copy, create derivative works, publish, distribute". Bulk automated download needs permission | "Source: International Monetary Fund, Primary Commodity Prices, <link>"; state material transformation | Yes: "Some statistical products may incorporate information from third parties". PCPS documentation names Refinitiv (Brent, Dubai, WTI, TTF, Henry Hub) and Argus (Australian coal, Asia LNG) | View-only at most; ask copyright@imf.org |
| **IMF PortWatch** | No licence on its own FAQ. "Commercial redistribution": contact copyright@imf.org. A "CC BY 4.0" seen in search results comes from the HDX mirror's site footer, not the IMF | "Sources: Kpler; UN Global Platform; IMF PortWatch (portwatch.imf.org)." | Vessel data is Kpler's | View-only at most; ask copyright@imf.org |
| **JODI** | **No terms page** (`/about-jodi/terms-of-use.aspx` returns 404). The user guide asks for a citation and expects "derivative work" | "International Energy Forum (IEF). Joint Organizations Data Initiative (JODI) Database. JODI Oil and Gas World Databases: www.jodidata.org, Accessed <date>." | Data are national submissions | Unknown; ask the IEF before showing |

ODP itself is Apache-2.0 (V5), so it adds no copyleft. Its data keeps each provider's own terms; ODP "does not host or serve data".

**What this branch commits:** code, and a fixture with invented values. **No provider data.**

## Refresh cadence

| Source | Publisher cadence | Lag seen on 15 Oct 2026 | Map cadence it would need |
| --- | --- | --- | --- |
| EIA spot | Weekly release; daily values | 9 days (6 Oct) | Monthly is enough for context |
| IMF PCPS | Monthly | about 2 weeks (September present) | Monthly |
| JODI | Monthly, around the 20th; most reporters M-1 | about 3 months (July) | Monthly |
| PortWatch | Weekly, Tuesdays 9 AM ET, with revisions | 4 days (11 Oct) | Weekly to monthly. Pull a trailing window, because revisions rewrite recent days |

Any of these would ride the planned monthly refresh (`scripts/refresh/monthly.sh`). Only PortWatch argues for weekly. **`DEMO_KEY` is not documented by EIA anywhere.** A scheduled job needs a registered free EIA key in the sops store; the existing task covers it, and it is the maintainer's to set.

## Against the explore note's spike design

The note's spike measured operator minutes per question across two arms, for a backtesting goal. Adapted to this project:

| Metric | Threshold | Result |
| --- | --- | --- |
| Setup | under 45 min | ✅ about 15 min, including discovering the endpoint names |
| Series answered with no paid key or sign-up | all four | ✅ 4 of 4 (EIA on `DEMO_KEY`) |
| Error or empty rate | ≤ 10% of calls | ✅ 0 failed calls after fixing two ODP key spellings (`bab_el-mandeb_strait`, `south_korea`); JODI's absent countries are publisher gaps, not errors |
| Answer agreement | within 1% | ⚠️ WTI yes; Brent and Henry Hub no (different instruments, above) |
| Saves time over direct scripts | yes | ❌ marginal: one endpoint per source, and the existing EIA client already exists |

Verdict on ODP for this project: **watch**. It is a good exploration tool and an unnecessary production dependency.

## If the maintainer wants to go further

1. Email copyright@imf.org about showing PortWatch chokepoint transits view-only on a public, non-commercial site, with the attribution above. The same mail can ask about PCPS.
2. If yes: a direct PortWatch ingest (its ArcGIS endpoint, no ODP) into `public/data/chokepoint_transits.parquet`, view-only in the catalog, read by a `ScenarioContext` row: "Tanker transits through Hormuz: 1/day in the last 30 days vs 50/day a year earlier". It would be a second figure beside the scenario's own number, never folded into it.
3. Prices only if a reader asks for them, from EIA (public domain) rather than PCPS, naming the instrument.
