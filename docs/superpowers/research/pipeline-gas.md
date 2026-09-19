# R3 — Pipeline gas: can we build gas *pipeline* disruption scenarios?

**Date:** 2026-09-19 · **Status:** research note, no code changed · **Scope:** Q1 BACI HS 271121 usability · Q2 free alternatives · Q3 route share tables · Q4 commodity-axis design

Today the app's gas axis is **LNG only** (BACI HS 271111 + LNG-T3 voyages). The question is whether we can add
pipeline-gas scenarios — Ukraine transit, TurkStream, Nord Stream, Yamal–Europe, TransMed/Medgaz, Norway→EU,
Power of Siberia, Central Asia–China — which need bilateral trade in **gaseous** natural gas (HS 271121).

**Headline: BACI HS 271121 is unusable — but there is a free, CC BY 4.0, bilateral substitute that works for
Europe: Eurostat `nrg_ti_gas`.** BACI records **zero** Russian pipeline gas into Germany and into Türkiye in
every year 2015–2024; Eurostat records 55.4 bcm and 21.6 bcm respectively. Recommendation: **conditional go for
European pipeline scenarios on Eurostat, no-go for the non-European routes** (Power of Siberia, Central
Asia–China, Canada→US). Details in [Go / no-go](#go--no-go).

---

## Method and reproducibility

HS 271121 was extracted from the pinned CEPII `BACI_HS92_V202601` zip using the same byte-offset range reads as
`scripts/ingest/baci.py` (`_YEAR_ENTRIES`, `_fetch_year_csv`, `filter_products`), years 2015–2024, into a scratch
directory. **No repo file was modified and nothing was staged.** BACI numeric codes were mapped with
`_load_baci_country_map()` from `scripts/transform/build_trade_flow.py`, exactly as the production transform does.

**Conversion factor used throughout: 1 bcm of natural gas = 0.735 Mt** (density 0.735 kg/m³ at standard
conditions), i.e. `bcm = tonnes / 735_000`. This is the factor the task specified; everything below is stated so
that the factor can be swapped without changing the conclusions — the failures are 2–5× and structural, not
10–20% calibration errors.

Reference figures come from, in order of preference: the Energy Institute Statistical Review 2026 workbook
already in the repo (`data/raw/ei_statistical_review/EI-Stats-Review-ALL-data-2026.xlsx`), the pipeline
operator (Gassco), and the national regulator (Canada Energy Regulator). Nothing below is quoted from memory.

---

## Q1 — Is BACI HS 271121 usable?

### Q1.1 The expected problem (missing quantities) is *not* the problem

The prior was that BACI's gaseous-gas quantities are patchy. Measured, they are not:

| Year | Rows | Rows with null `q` | % null | Total value (bn USD) | **% of value on rows with `q`** |
|---|---:|---:|---:|---:|---:|
| 2015 | 495 | 9 | 1.8% | 120.1 | 100.0% |
| 2016 | 329 | 11 | 3.3% | 93.2 | 98.3% |
| 2017 | 340 | 17 | 5.0% | 116.0 | 100.0% |
| 2018 | 342 | 19 | 5.6% | 137.9 | 100.0% |
| 2019 | 341 | 16 | 4.7% | 112.1 | 100.0% |
| 2020 | 368 | 25 | 6.8% | 78.7 | 100.0% |
| 2021 | 386 | 13 | 3.4% | 185.3 | 100.0% |
| 2022 | 385 | 12 | 3.1% | 412.3 | 100.0% |
| 2023 | 423 | 20 | 4.7% | 219.6 | 100.0% |
| 2024 | 345 | 18 | 5.2% | 169.6 | 100.0% |

Null quantities sit on 2–7% of rows and **essentially 0% of value** (rounding to 100.0% at 1 d.p. every year but
2016). Zero quantities: none. On the stated test, HS 271121 looks *better* covered than HS 2709.

That framing is a trap. The file has two far worse defects.

### Q1.2 Defect 1 — the biggest real flows are simply absent

BACI records bilateral trade as *declared*. For pipeline gas, the declared counterparty is the counterparty of the
**commercial transaction**, not the country the molecules came from. Gazprom sold at the German border to traders;
Germany's customs declarations therefore do not name Russia.

**Russia → Germany is zero in BACI HS 271121 in every year 2015–2024.** Not small. Not null-quantity. Absent.

Germany's complete BACI pipeline-gas import matrix, bcm (at 0.735):

| From | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NOR | 48.7 | 46.5 | 52.2 | 47.3 | 49.2 | 53.0 | 55.3 | 61.6 | 53.8 | 39.1 |
| BEL | 1.7 | 0.8 | 2.8 | 1.6 | 0.9 | 0.9 | 1.9 | 24.2 | 20.0 | 14.6 |
| FRA | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.5 | 2.5 | 0.7 |
| **RUS** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| **NLD** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |

Germany's total BACI pipeline-gas imports in 2021 are **57.7 bcm**, of which Norway is 55.3. There is no Russian
gas and no Dutch gas at all. A "how exposed is Germany to a Russian pipeline cut" scenario computed on this file
returns **0% exposure** — a confidently wrong answer, which is worse than no answer.

**Russia → Türkiye is likewise zero in every year 2015–2024.** Türkiye's entire BACI pipeline-gas import list for
2022 is Azerbaijan (6.8 bcm) and Kazakhstan (0.01 bcm). Blue Stream and TurkStream do not appear.

Aggregate check against the Energy Institute (`Gas - Trade movements` sheet, rows 42–43; EI is region-level, so
this is the closest comparable aggregate):

| Year | BACI Russia→European importers (bcm) | EI Russia→Europe pipeline (bcm) | Ratio |
|---|---:|---:|---:|
| 2019 | 65.0 | 191.3 | **0.34** |
| 2020 | 59.6 | 167.4 | **0.36** |
| 2021 | 67.5 | 167.7 | **0.40** |
| 2022 | 41.3 | 85.6 | **0.48** |
| 2023 | 20.8 | 45.7 | **0.45** |
| 2024 | 27.7 | 51.6 | **0.54** |

| Year | BACI Russia→world (bcm) | EI Russia pipeline exports (bcm) | Ratio |
|---|---:|---:|---:|
| 2019 | 98.6 | 220.7 | 0.45 |
| 2021 | 76.7 | 201.3 | **0.38** |
| 2023 | 37.6 | 91.0 | 0.41 |
| 2024 | 56.0 | 111.3 | 0.50 |

BACI sees **38–54%** of Russian pipeline gas. The missing 46–62% is not randomly distributed — it is concentrated
in exactly the importers a Ukraine-transit or Nord-Stream scenario exists to rank.

### Q1.3 Defect 2 — hub re-exports are counted as origin, and double-counted

The top 2023 pairs by value include, alongside real production flows, a stack of hub re-exports:

| Exporter → importer | 2023 value (bn USD) | tonnes | bcm @0.735 | USD/t |
|---|---:|---:|---:|---:|
| NOR → DEU | 24.43 | 39,550,070 | 53.8 | 618 |
| **BEL → FRA** | **18.74** | 24,486,030 | **33.3** | 765 |
| NOR → GBR | 13.09 | 20,791,696 | 28.3 | 629 |
| DZA → ITA | 12.03 | 16,554,500 | 22.5 | 727 |
| CAN → USA | 11.55 | 17,050,308 | 23.2 | 678 |
| TKM → CHN | 9.61 | 14,303,037 | 19.5 | 672 |
| **BEL → DEU** | **9.46** | 14,733,754 | **20.1** | 642 |
| NOR → BEL | 7.97 | 11,763,617 | 16.0 | 678 |
| **FRA → ITA** | **7.73** | 12,890,353 | **17.5** | 600 |
| NOR → FRA | 7.07 | 11,395,100 | 15.5 | 620 |
| **NLD → BEL** | **2.53** | 3,968,563 | **5.4** | 637 |
| **ESP → FRA** | **2.51** | 2,892,346 | **3.9** | 868 |
| **FRA → BEL** | **2.24** | 2,199,667 | **3.0** | 1017 |

Belgium produces no natural gas, yet "exports" 33.3 bcm to France and 20.1 bcm to Germany in 2023 — while
importing 16.0 bcm from Norway. These are Zeebrugge regasified LNG and transiting Norwegian gas re-declared at
each border. France appears simultaneously as an importer from Belgium/Norway/Spain **and** an exporter to Italy
and Belgium. Any Σ(imports × route share) over this matrix double-counts the same molecules across two to four
country pairs, and attributes them to the wrong origin.

The same mechanism explains the Belgium→Germany jump from 1.9 bcm (2021) to 24.2 bcm (2022): that is not new
Belgian supply, it is Germany re-sourcing through the Belgian hub after the Russian cut — origin laundering,
visible in the file as a new "exporter".

### Q1.4 Defect 3 — the quantities are value-imputed at a single global unit value

This is why the null-quantity test was misleading. BACI's quantities for the large rows are not independent
measurements; they are derived from value at a common unit price. The signature is the implied unit value:

Look at the USD/t column above. In 2023, **NOR → DEU is 618 USD/t and CAN → USA is 678 USD/t** — a 10% spread.
But in 2023 the Energy Institute's own price sheet (`Gas Prices `, row 45) records **Netherlands TTF at
12.87 USD/MMBtu and US Henry Hub at 2.53 USD/MMBtu** — a **5.1× spread**. European and North American gas cannot
physically have the same USD/t. Either the value or the quantity has to be wrong, and for CAN→USA it is the
quantity.

Consequence: the quantity error is *systematically regional*. Pairs priced near TTF come out roughly right; pairs
priced at Henry Hub or on long-term Asian contracts come out 2–5× too low.

### Q1.5 BACI vs reference, the named pairs

| Pair | Year | BACI tonnes | BACI bcm @0.735 | Reference bcm | **Ratio** | Implied kg/m³ | Reference |
|---|---|---:|---:|---:|---:|---:|---|
| RUS → DEU | 2021 | **0 rows** | **0.0** | ~50–55 | **0.00** | — | absent from BACI entirely (§Q1.2) |
| RUS → TUR | 2022 | **0 rows** | **0.0** | ~21 | **0.00** | — | absent from BACI entirely (§Q1.2) |
| NOR → DEU | 2022 | 45,256,900 | 61.6 | **55.6** (DEU+DNK) | 1.11 | 0.814 | Gassco [G1] |
| NOR → DEU | 2023 | 39,550,070 | 53.8 | **56.2** (DEU+DNK) | 0.96 | 0.704 | Gassco [G1] |
| NOR → GBR | 2022 | 24,807,759 | 33.8 | **27.9** | 1.21 | 0.889 | Gassco [G1] |
| NOR → GBR | 2023 | 20,791,696 | 28.3 | **24.1** | 1.17 | 0.863 | Gassco [G1] |
| NOR → FRA | 2023 | 11,395,100 | 15.5 | **13.8** | 1.12 | 0.826 | Gassco [G1] |
| NOR → BEL | 2023 | 11,763,617 | 16.0 | **15.0** | 1.07 | 0.784 | Gassco [G1] |
| DZA → ITA | 2022 | 11,202,328 | 15.2 | ~21–22 | ~0.71 | ~0.52 | see Q3 note |
| DZA → ESP | 2022 | 5,258,050 | 7.2 | ~9 | ~0.79 | ~0.58 | see Q3 note |
| RUS → CHN | 2023 | 9,582,355 | 13.0 | **21.5** | **0.61** | 0.446 | EI 2026, `Gas - Trade movements` row 77 |
| TKM → CHN | 2023 | 14,303,037 | 19.5 | ~30–35 | ~0.57 | ~0.45 | EI gives Other CIS→China 37.9 (incl. KAZ, UZB), row 78 |
| CAN → USA | 2023 | 17,050,308 | 23.2 | **80.6** | **0.29** | 0.212 | Canada Energy Regulator [G2] |

The implied density needed to reconcile BACI with reality ranges from **0.21 to 0.89 kg/m³** across pairs in the
same year. No single conversion factor exists. That, plus two structural zeros, is the whole answer.

Citations:

- **[G1] Gassco, "New delivery records for Norwegian natural gas"** — https://gassco.eu/en/new-delivery-records-for-norwegian-natural-gas — 2024. Delivery table, all figures BCM: `Total 2022 116,9 / 2023 109,1`; `Germany/Denmark 2022 55,6 / 2023 56,2`; `Great Britain 27,9 / 24,1`; `France 17,8 / 13,8`; `Belgium 15,6 / 15`. Corroborated by Reuters: *"In 2023, Gassco delivered 109.1 billion cubic metres (bcm) of gas through its 8,800-km (5,468-mile) pipeline network to Belgium, Britain, France, Germany and Denmark, down 6.7% from 116.9 bcm a year earlier."* (https://www.reuters.com/business/energy/norway-piped-gas-volume-could-rival-historic-high-this-year-gassco-says-2024-08-27). Derivation: Gassco is the system operator; its per-market delivery table is the physical measurement. Note Germany and Denmark are reported together because of the Europipe II Denmark offtake, so the DEU figure is a slight over-statement of Germany alone — which makes BACI's NOR→DEU look *better* than it is.
- **[G2] Canada Energy Regulator, "Market Snapshot: Overview of Canada–U.S. Energy Trade"** — https://www.cer-rec.gc.ca/en/data-analysis/energy-markets/market-snapshots/2025/market-snapshot-overview-of-canada-us-energy-trade.html — 2025. *"In 2023, Canada exported 7.8 billion cubic feet per day (Bcf/d) of natural gas, all of which went to the U.S."* Derivation: 7.8 Bcf/d × 365 d = 2,847 Bcf = **80.6 bcm** (1 bcm = 35.315 Bcf).
- **[G3] Energy Institute, Statistical Review of World Energy 2026** — `data/raw/ei_statistical_review/EI-Stats-Review-ALL-data-2026.xlsx`, sheet `Gas - Trade movements`. Row 77 "China pipeline imports of which Russian Federation": 2021 7.6, 2022 14.6, **2023 21.5**, 2024 29.5, 2025 36.7 bcm. Rows 42–43 "Russia pipeline exports / of which Europe": 2021 201.3 / 167.7, **2023 91.0 / 45.7** bcm. Sheet `Gas Prices `, row 45 (2023): Netherlands TTF **12.87**, US Henry Hub **2.53** USD/MMBtu.

### Q1.6 Would value-based imputation rescue it?

No, for three independent reasons:

1. **There is no value to impute from.** RUS→DEU and RUS→TUR have zero rows — zero quantity *and* zero value.
   Imputation operates on rows that exist; it cannot create the ~50 bcm of Russian gas Germany bought in 2021.
2. **Value-based imputation is the cause, not the cure.** §Q1.4 shows BACI's own quantities are already
   value-derived at a near-uniform unit value. Re-running the same trick reproduces the same 2–5× regional error.
3. **The existing repair does nothing useful here.** Running the production `repair_quantities()` (band = 5×
   median unit value per hs_code-year) over the 271121 rows flags **790 of 3,754 rows (21.0%)** — but those rows
   carry **0.60% of total value**. It cleans noise on tiny rows and leaves every structural defect untouched.

Even if all three were solved, hub double-counting (§Q1.3) would still make the denominator (`totalQty` per
importer) wrong, so `shareAtRisk` would be wrong even where `atRiskQty` was right.

### Q1 verdict

> **NOT USABLE.** Not because quantities are missing — they are 95–98% present and cover ~100% of value — but
> because (a) Russia→Germany and Russia→Türkiye, the two flows the marquee scenarios turn on, are entirely absent
> in all ten years; (b) BACI captures only 38–54% of Russian pipeline exports; (c) hub re-exports (BEL→FRA 33 bcm,
> BEL→DEU 20 bcm, FRA→ITA 18 bcm in 2023) are booked as origin flows and double-counted; and (d) the quantities
> are value-imputed at a near-uniform global unit value, so pairs outside the TTF price zone are 2–5× too low
> (CAN→USA 0.29×, RUS→CHN 0.61×). Value-based imputation cannot fix any of this. Do not ship a pipeline-gas
> scenario on BACI 271121.

---

## Q2 — Free alternatives

### Q2.0 The winner, stated up front

**Eurostat `nrg_ti_gas` / `nrg_ti_gasm` — "Imports of natural gas by partner country".** It is bilateral, it is
in native volume units, it covers the full 1990–2024 span of our year slider, it is **CC BY 4.0 (redistributable)**,
the API is open and needs no key, and — the decisive test — **it gets right exactly what BACI gets wrong**:

| Germany's gas imports from Russia, 2021 | |
|---|---|
| BACI HS 271121 | **0** (no rows in any year) |
| **Eurostat `nrg_ti_gas`, `partner=RU`, `siec=G3000`, `unit=MIO_M3`** | **55,443 million m³ = 55.4 bcm** |

| Türkiye's gas imports from Russia | 2021 | 2022 | 2023 | 2024 |
|---|---:|---:|---:|---:|
| BACI HS 271121 | 0 | 0 | 0 | 0 |
| **Eurostat** (bcm) | **26.3** | **21.6** | **21.3** | **21.6** |

Germany 2021 in full, from Eurostat (bcm): Total 84.8 · Russia 55.4 · Norway 16.2 · **Not specified 13.2**.
The "Not specified" residual is Eurostat's honest label for gas whose origin the reporter could not attribute —
which is precisely the hub problem BACI silently mislabels as a Belgian export.

Cross-checks against the Q3 sources: Eurostat Hungary←Russia 2023 = **6.41 bcm** against Reuters' "6 bcm in 2023"
[T2]; Eurostat Italy←Russia 2021 = **29.2 bcm** against BACI's 28.2 (the one pair BACI gets roughly right).

### Q2.1 The candidate table

| Source | Coverage | Bilateral? | Frequency | Pipeline vs LNG? | Licence | Redistributable? | Ingest |
|---|---|---|---|---|---|---|---|
| **Eurostat `nrg_ti_gas(m)`** | 44 reporters incl. TR, UA, MD, RS, BA, MK, GE, GB, NO; 166 partners. Annual **1990–2024**; monthly **2008-01 → 2026-08** | **Yes** — reporter × partner | Annual **and** monthly | **Yes** — `siec` G3000 (natural gas) and G3200 (LNG); **pipeline = G3000 − G3200** | **CC BY 4.0** | **Yes** | **Easy.** Open JSON-stat API, no key |
| EI Statistical Review pipeline matrix | World, but see below | **No** (fatal) | Annual series are region-level; the bilateral matrix is **one year only** | Yes (separate LNG/pipeline sheets) | Free, terms on site; already view-only here | **No** | Already in repo |
| Bruegel European gas imports | EU aggregate, daily, 2015→ | **No** — by *route* into the EU, not by member state | Daily / weekly | Yes, and **by Russian corridor** (Nord Stream, Yamal, Ukraine, TurkStream) | Dataset-page grant (permissive); site-wide policy says CC BY-**ND** — see below | **Yes**, per the dataset page | Easy, but the bulk file is **frozen** at 2026-07-02 |
| ENTSOG Transparency Platform | EU TSO network, hourly/daily | Point-level; attribution to country pairs is on you | Hourly/daily | Physical flows, pipeline only | Self-contradictory (TP T&C vs site T&C) | **No** without written consent | Hard |
| JODI Gas | ~100 economies, 2009-01→ | **No** — no partner dimension at all | Monthly | National totals only | *"All such rights are reserved"* | **No** | Easy but useless here |
| IEA Gas Trade Flows | World, 2021-06→ | Yes, by border point **and** partner country | Monthly (M-1) | Yes | "Terms of Use for Non-CC Material" | **No** (5-data-point cap) | Account-gated |

### Q2.2 Per-source detail

**Eurostat `nrg_ti_gas` (annual) / `nrg_ti_gasm` (monthly)**
Dataset label: *"Imports of natural gas by partner country - monthly data"*. Dimensions verified live against the
API: `siec` ∈ {G3000 Natural gas, G3200 Liquefied natural gas}; `partner` 166 entries; `unit` ∈ {MIO_M3 million
cubic metres, TJ_GCV}; `geo` 44 reporters (listed above, plus EU-27 and euro-area aggregates).
Licence — Eurostat, *"Copyright notice and free re-use of data"*
(https://ec.europa.eu/eurostat/web/main/help/copyright-notice): the general principle is the **CC BY 4.0**
international licence, and *"There is no special procedure or requirement for a written licence. Just download
the material and use it, unless the material is listed in the exceptions above."* The reuse grant is stated at
https://ec.europa.eu/eurostat/help/copyright-notice as *"Reuse of statistical data, metadata, publications, and
other dissemination tools published on this website for commercial or non-commercial purposes is authorised
provided the source is acknowledged"*, with the rider *"When reuse involves translations of publications or
modifications to the data or text, this must be stated clearly to the end user of the information. A disclaimer
regarding the non-responsibility of Eurostat shall be included."* — both of which the project's existing
methodology-page and catalog machinery already satisfy. Citation form required:
`Source: [DOI of the Eurostat dataset], [access date]`.

**One ambiguity, currently moot.** The copyright notice also carves out: *"The following Eurostat data and
documents may not be reused for commercial purposes … Data for countries other than: Member States of the
European Union (EU), Member States of the EFTA, official EU acceding and candidate countries."* Whether "data
for" reaches the **partner** dimension (Russia, Algeria, Qatar as partners of an EU reporter) is genuinely
unclear. The site is non-commercial, so this does not bite today — but it should be pinned before any commercial
use. Independent numeric check that the pipeline identity holds: Spain 2024, partner Algeria, G3000 = 11,669.9
vs G3200 = 2,251.4 MIO_M³ (⇒ ~9,418.6 by pipe); partner United States, G3000 = G3200 = 5,060.9 (all LNG,
difference exactly zero).
API: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_ti_gas?format=JSON&lang=EN&...`,
JSON-stat, no key, filterable by `geo`, `partner`, `siec`, `unit`, `time`/`sinceTimePeriod`.
**Limitations:** (i) reporters are European only — Power of Siberia, Central Asia–China and Canada→US are out of
scope entirely; (ii) origin is as the reporter declares it, so a "Not specified" bucket exists and Norway is
under-attributed where its gas arrives via the Dutch or Belgian systems (Eurostat DE←NO 2021 = 16.2 bcm against
Gassco's 55.6 to Germany+Denmark [G1]) — Eurostat is right about Russia and incomplete about Norway, the
opposite of BACI; (iii) annual data end 2024, the same as BACI, though the monthly series runs to 2026-08.

**EI Statistical Review pipeline trade matrix — checked in the 2026 workbook, and it is *not* bilateral enough.**
This was worth testing because EI is already a view-only source in the project. Two sheets exist:
- `Gas - Trade movements` (115 rows, 2000–2025): a **region-level** time series. Europe's pipeline imports are
  broken out only as "of which: Russian Federation / Africa / Other CIS / Middle East". No country pairs.
- `Gas trade 2025 - pipeline` (378 rows): a genuine from→to matrix, but **for a single year (2025)**, and the
  importer rows are `Canada, Mexico, US, Argentina, Brazil, EU, Non-EU Europe, Belarus, Kazakhstan, Russian
  Federation, Other CIS, UAE, Other Middle East, South Africa, Other Africa, Australia, China, Malaysia,
  Singapore, Thailand` — **the whole EU is one row.** There is no Germany, no Italy, no Slovakia.
  Exporter columns mix countries with aggregates (`Other Europe`, `Other S. & Cent. America`, `Other Africa`).
  The sheet's own footnote: *"*intra-region trade is excluded. For example, trade between countries"* — so
  intra-European pipeline flows are absent by construction.

  **Verdict: unusable for importer-level exposure.** It is excellent as a *reference* for validating another
  dataset (which is how this note used it) and nothing more.

  **And the licence would have blocked it anyway.** The sheet's own footer reads *"Source: Includes data from FGE
  NexantECA, S&P Global Energy"*, and EI's "Quoting from the review" page states: *"The redistribution or
  reproduction of data whose source is S&P Global Commodity Insights, S&P Global Inc, or S&P Global Platts is
  strictly prohibited without its prior authorisation."* — alongside *"Publishers are welcome to quote from this
  review provided that they attribute the source … However, for extensive reproduction of tables and/or charts,
  permission must first be obtained."* This confirms EI's existing view-only classification in `LICENSE-DATA.md`
  and extends it specifically to the gas trade matrix. **Caveat:** that wording was reached from a third-party
  mirror of the **2025 (74th)** edition PDF; the 2026-edition text on an `energyinst.org` URL could not be
  retrieved (the PDF is behind an email gate). See the open questions.

**Bruegel, "European natural gas imports"** (https://www.bruegel.org/dataset/european-natural-gas-imports).
First published 2022-06-16, still updated (latest 2026-07-02). *"This dataset aggregates daily data on European
natural gas import flows and storage levels."* Its Figure 3 is exactly the route decomposition a pipeline
scenario wants: *"The largest share of gas used to be delivered from Russia via four distinct corridors Nord
Stream, Yamal (via Poland), Ukraine and Turkstream (via Turkey)"*, with weekly volumes per route.
**But it is EU-aggregate, not per member state** — "weekly extra-EU imports of natural gas" — so it cannot rank
importers, which is what the scenario panel does.

**Licence — two Bruegel texts conflict, and the dataset-specific one governs.** The site-wide republishing policy
(https://www.bruegel.org/publications) says *"Bruegel publications can be freely republished and quoted according
to the Creative Commons licence CC BY-ND 4.0 … Any reproduction must be unaltered."* — which would forbid
derivatives. But the dataset page carries its own, explicitly broader grant: *"Users can freely use our data in
its unchanged form or after any transformation for any purpose and can freely distribute it, provided that proper
attribution is made to the source, but not in any way that suggests that Bruegel endorses the user or their use
of the data."* That is an express **transform + distribute** grant and it is the more specific instrument. **Get
this confirmed in writing before relying on it** — the ND policy sitting one click away is exactly the kind of
ambiguity `LICENSE-DATA.md` exists to keep off the site.

**Second problem, independent of licence: the bulk file is frozen.** Bruegel notes a *"significant revision …
to the data processing pipeline in September 2026"* and that the legacy dataset (*"running until 2 July 2026"*)
*"will no longer be updated"*. A layer built on it would be dead on arrival.

**Where Bruegel is genuinely valuable:** its `route_data` file carries `Nord Stream`, `Ukraine Gas Transit`,
`Yamal (BY,PL)` and `Turkstream` as *named columns* — which is the one published series that would close the two
biggest gaps in Q3 (Yamal–Europe's 2021 throughput and Nord Stream's 2022 throughput). Worth archiving to the R2
raw bucket now, while the legacy ZIP still exists, whether or not a layer is ever built.

**ENTSOG Transparency Platform** (https://transparency.entsog.eu). Physical flows at interconnection points,
hourly, public REST API (JSON/XML/CSV/XLSX), no key, 60-second query cap and an explicit anti-bulk clause. In
principle the highest-fidelity European source and the only one that measures the *physical* route rather than
the commercial counterparty — which would solve the Q3.0 corridor problem.

**Its two governing documents contradict each other.** The TP Terms & Conditions (Rev. 3, 2018) Art. 5.2 grants
quoting with attribution — *"When quoting information or data from this ENTSOG TP, you shall at least indicate
the source, and the date of data download/extraction, following this outline 'ENTSOG TP [DD-MM-YYYY]
https://transparency.entsog.eu/'."* — and Art. 5.7 explicitly blesses automation: *"The automate download of
data is possible via the API tool of the ENTSOG TP."* But the main-site terms
(https://www.entsog.eu/privacy-policy-and-terms-use) Art. 4.2, which the TP terms say they *complete*, read:
*"You shall not transfer, sell, display, republish, retransmit, redistribute, create derivative works from, or
otherwise make the contents or any part of It, of this Website available to any other party … without ENTSOG's
express prior written consent."*

**Treat as display-only at best, and ask ENTSOG in writing before shipping any derived file.** Ingest is also the
hardest of any candidate: point-level data must be mapped to border pairs, directions netted, and TSO-specific
quirks handled. Deferred.

**Eurostat vs ENTSOG, in one line:** Eurostat answers "who did Germany buy from" (commercial origin, which is
what an exposure metric wants); ENTSOG answers "what crossed the Mallnow meter" (physical route, which is what a
route highlight wants). Eurostat is the one the engine needs.

**JODI Gas** (https://www.jodidata.org/gas/). *"Complete data series for all products, flows and countries, from
January 2009 to one month-old can be downloaded, for free, in a beta version of .csv format."* The schema is
product × flow × country × month: national production, imports, exports and stocks. **There is no partner
dimension** — JODI never says who the gas came from, so it cannot feed an exporter→importer map at all.
Its terms of use (https://www.jodidata.org/terms-of-use.aspx) contain no reuse grant of any kind: *"The
Intellectual Property rights in the JODI Website, and in the material published on it, are protected by
Intellectual Property laws and treaties around the world. All such rights are reserved."* Out on both counts.

**IEA Gas Trade Flows** (https://www.iea.org/data-and-statistics/data-product/gas-trade-flows). Free of charge
but not free to reuse, and it is the most tantalising near-miss here: *"The information is collected by
border-point, trade partner country, amounts (in cubic meters), and maximum flow capacity"* — border point **and**
partner country in one table, which is exactly the corridor attribution Q3.0 says we would otherwise have to
author ourselves. Monthly at M-1 from 2021-06.

The licence closes it. The product's own citation string ends *"Licence: Terms of Use for Non-CC Material"*, and
https://www.iea.org/terms states *"The following content is not made available under a CC BY 4.0 licence …
Standalone datasets, data explorers and databases."* The operative limit
(https://www.iea.org/terms/terms-of-use-for-non-cc-material): *"You must not share, or enable others to access,
any Non-CC Material"*, and even its permissive limb caps reuse at *"anything greater than 5 (five) numerical data
points … must not be made available in a separate downloadable and/or manipulable format and must be presented
either in graphical format or aggregated (in such a manner that the reader cannot reverse engineer or extract the
original underlying numerical data)"*, on an *"occasional, ad-hoc basis and not reproduced in a regular cycle"*.
A persistent, tooltip-inspectable, regularly-refreshed map layer fails every limb. Consistent with the standing
decision in `docs/commercial-data-options.md`. **Not pursued.**

### Q2 verdict

> **Eurostat `nrg_ti_gas` / `nrg_ti_gasm` is the answer, and it is better than view-only — it is CC BY 4.0,
> i.e. downloadable under the project's existing `LICENSE-DATA.md` rule.** It is bilateral, native-volume,
> 1990–2024 annual (monthly to 2026-08), separates pipeline from LNG via `G3000 − G3200`, covers 44 reporters
> including Türkiye, Ukraine, Moldova and the Western Balkans, and has a keyless JSON API. Its ceiling is
> geographic: **Europe + Türkiye only**. EI's pipeline matrix is region-level and single-year (unusable);
> Bruegel is CC BY-**ND** (cite, never transform); JODI has no partner dimension; IEA is paid; ENTSOG is
> unverified and hard.

---

## Q3 — Scenario share tables

**Read this section together with the Q1/Q2 verdicts.** These share tables are the *easy* half of a pipeline-gas
scenario and they are mostly sourceable. The hard half — a bilateral trade matrix to multiply them against — is
not. The tables are recorded here so the work is not repeated if a dataset appears.

**Share semantics.** As in `disruption_route`, `share` is the fraction of that **(exporter, importer)** pair's
pipeline-gas trade that moves on the named route. `importer_iso3 = null` means "all buyers of this exporter".

### Q3.0 A structural problem the current schema cannot express

Pipeline routes are **transit corridors**, not point-to-point links. Russian gas entering the EU at Velké
Kapusany is declared as a Slovak entry but is consumed in Slovakia, Austria, Italy, Czechia and Hungary. The
engine's `(exporter, importer) → share` model can express "what fraction of Italy's Russian gas came via
Ukraine" only if someone has already done the corridor attribution. The operator statistics attribute by **entry
point**, not by final buyer. Every share below that involves an onward market (AUT, ITA, CZE from the Slovak
entry) is therefore marked UNSOURCED — not because no number exists, but because the published numbers answer a
different question and converting them is analysis we would have to author and defend ourselves.

**The canonical illustration, in one sentence:** ORF, "Slovakia and the Ukraine Gas Deal"
(https://www.orfonline.org/expert-speak/slovakia-and-the-ukraine-gas-deal) — *"In 2023, Slovakia received 12.67
billion cubic meters of Russian gas via Ukraine, of which it consumed 4.3 billion cubic meters of gas."*
Eurostat's own Slovakia←Russia figure for 2023 is **2.88 bcm**. Three defensible numbers (12.67 entry, 4.3
consumed, 2.88 declared imports) for one country-year, differing by 4×.

**`disruption_route`'s schema is destination-family** (`exporter_iso3 → importer_iso3` = who bought it), and
Eurostat is a destination-family source. Keep the two consistent and treat Slovakia as a transit node, not as the
importer of 12.7 bcm. Corroborating destination-family volumes for 2023, from Rystad Energy
(https://www.rystadenergy.com/news/end-of-ukraine-gas-transit-lng-and-pipeline): *"Slovakia, Austria and Moldova
are the European nations most dependent on transit volumes, importing about 3.2 Bcm, 5.7 Bcm and 2.0 Bcm,
respectively, in 2023."* — which sits within ~10% of Eurostat for Slovakia and is the right order for the others.

### Q3.1 Ukraine transit (`ukraine_transit`)

Ended **1 January 2025** when the 2019 Gazprom–Naftogaz five-year transit agreement expired.

Annual transit: **2020 55.8 · 2021 41.6 · 2022 ~19–20 · 2023 14.6 · 2024 15.43 bcm.**

Destination split over the whole 2019–2024 contract (entry-point basis): Slovakia 108.6 bcm (73%), Hungary
16.5 bcm (11%), Moldova 12.6 bcm (8.5%), Poland 8.5 bcm (5.5%), Romania 1.7 bcm (1.2%).
In 2024 alone: Slovakia 13.5 bcm, Moldova 1.9 bcm.

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| RUS | SVK | 2021 | **1.00** | Slovakia had no non-Ukrainian Russian route before 2025; the whole 2019–24 corridor delivered 73% of its volume to Slovakia [U1] |
| RUS | SVK | 2023 | **1.00** | as above; in 2024 13.5 of 15.43 bcm went to Slovakia [U1] |
| RUS | MDA | 2021 | **1.00** | Moldova's only Russian supply route pre-2023 was Ukraine transit; 12.6 bcm over the contract [U1] |
| RUS | MDA | 2023 | **1.00** | 1.9 bcm in 2024, "down 1.8% compared to 2023" [U1] |
| RUS | AUT | 2023 | **1.00** | Austria took Russian gas only via Ukraine→Slovakia→Baumgarten; CGEP lists Ukraine as its sole corridor and puts its volume at ~5 bcm [U6]; Rystad 5.7 bcm |
| RUS | ITA | 2023 | **1.00** | Italy's residual Russian pipeline gas (CGEP: *"estimated at between 3 and 4 bcm"*) all arrived via the Ukraine corridor [U6]; Eurostat IT←RU 2023 = 2.93 bcm |
| RUS | SVN, HRV | 2023 | 1.00 of a near-zero base | *"minuscule volumes"*; Slovenia near-zero after 1 Jan 2023 [U6] |
| RUS | HUN | 2021 | UNSOURCED | Hungary switched its main contract to TurkStream in Oct 2021 mid-year; no published 2021 split by route |
| RUS | HUN | 2023 | **~0.08** *(low confidence)* | derived: Hungary's Russian imports 2023 ≈ 6 bcm [T2], of which >5.5 bcm via TurkStream [T3] → residual via Ukraine ≈ 0.5 bcm. Two sources, two methodologies — treat as an order of magnitude, not a number |
| RUS | POL | 2021 | UNSOURCED | 8.5 bcm over the contract but Poland also took Yamal–Europe; no per-year route split found |
| RUS | ROU | 2021/2023 | UNSOURCED | 1.7 bcm over six years; Romania also receives via Trans-Balkan/TurkStream |
| RUS | AUT, ITA, CZE | 2021 | **UNSOURCED** | these are onward markets from the Slovak entry — see Q3.0 |

Citations:

- **[U1] ExPro Consulting, "Ukraine transported 148 bcm of Russian gas over 5 years, 15.4 bcm in 2024"** — https://expro.com.ua/en/tidings/ukraine-transported-148-bcm-of-russian-gas-over-5-years-154-bcm-in-2024 — 2024-12-31. *"in 2024, the transit of Russian gas through the Ukrainian gas transmission system amounted to almost 15.43 bcm, which is 5.7% more than in 2023, when transit volumes fell to their lowest level since 1991 - 14.6 bcm."* and *"Most of the Russian gas through Ukraine during the 5-year contract was supplied to Slovakia - 108.6 bcm or more than 73% of all supplies. In addition, 16.5 billion cubic meters (11%) were supplied to Hungary, 12.6 bcm (8.5%) to Moldova, 8.5 bcm (5.5%) to Poland, and 1.7 bcm (1.2%) to Romania."* and *"In 2024 … 13.5 bcm were supplied to Slovakia … In addition, 1.9 bcm of Russian gas was supplied to Moldova, down 1.8% compared to 2023."* Derivation: entry-point destination split; Slovakia and Moldova have no alternative Russian route in these years, so the pair share is 1.00.
- **[U2] Oxford Institute for Energy Studies, NG196, "Transit of Russian gas across Ukraine: conditions for post-2024"** — https://www.oxfordenergy.org/wpcms/wp-content/uploads/2024/12/NG196-Transit-of-Russian-gas-across-Ukraine.pdf — 2024. *"at the agreed levels in 2020 and 2021, they fell to just ~20 bcm in 2022 and ~14 bcm in 2023, less than half the agreed levels."*
- **[U3] Columbia CGEP, "Will the Ukrainian Gas Transit Contract Continue Beyond 2024?"** — https://www.energypolicy.columbia.edu/will-the-ukrainian-gas-transit-contract-continue-beyond-2024 — *"The ship-or-pay transit contract foresaw a transit of 65 bcm in 2020, and then 40 bcm/y over 2021–24. Transit volumes amounted to 55.8 bcm in 2020 and 41.6 bcm in 2021, but dropped to around 19 bcm in 2022."*
- **[U4] European Commission, "End of transit via Ukraine"** — https://energy.ec.europa.eu/document/download/e8a46964-f29b-44f8-9410-689f9e34463b_en — *"the volumes delivered to European customers via Ukraine have decreased drastically, to 14.65 bcm in 2023"*.
- **[U5] Bruegel, "The end of Russian gas transit via Ukraine and options for the EU"** — https://www.bruegel.org/analysis/end-russian-gas-transit-ukraine-and-options-eu — Table 1 "EU gas imports, 2021-2024", TWh: Russian gas via Ukraine **409 (2021) / 193 (2022) / 140 (2023) / 112 (2024)**; Other Russian gas pipeline imports 1,080 / 472 / 140 / 115; Total gas imports 3,856 / 3,751 / 3,250 / 2,072; *"Ukrainian transit as % of EU imports | 11% | 5% | 4% | 5%"*. Derivation: this is the cleanest published **EU-aggregate** route split, and it is the basis on which a "Ukraine transit share of EU Russian pipeline gas" of 409/(409+1080) = **27% in 2021** and 140/(140+140) = **50% in 2023** can be stated. Note it is EU-wide, not per-importer.

- **[U6] Columbia CGEP, "Q&A: Russian Gas Transit through Ukraine"** — https://www.energypolicy.columbia.edu/qa-russian-gas-transit-through-ukraine — 2023. *"In the 12-month period between July 2022 and June 2023, six EU countries (Slovakia, Austria, Italy, Hungary, Slovenia, and Croatia) and Moldova continued to receive Russian gas through the Ukrainian transit corridor."* and *"Austria imported the highest volume (about 5 bcm) in absolute terms through Ukraine over the last 12 months, accounting for nearly half of the country's total imports over the same period. Italy also received a significant amount of Russian gas by pipeline via Ukraine (estimated at between 3 and 4 bcm), but this represented only a small (less than 5 percent) share of total imports. Slovakia (at close to 2 bcm) took approximately one-third of its imports from Russia via Ukraine. Hungary received only a fraction of its Russian-sourced gas via the Ukrainian route (through Slovakia and Austria), while the majority of its Russian imports have been rerouted through the European leg of the TurkStream pipeline via the Balkans since 2021."* and *"Moldova received nearly all of its natural gas imports via Ukraine, which added up to around 2.2 bcm in the July 2022 to June 2023 period."* and *"Slovenia and Croatia received minuscule volumes … Slovenia's imports dropped to near-zero since the expiration of Geoplin's contract with Gazprom on January 1, 2023."* Derivation: this is the closest thing to an authoritative destination-family list, but note it is a **rolling 12-month window (Jul 2022 – Jun 2023)**, not a calendar year — do not enter these as 2023 values without saying so.
- **[U7] OIES (Sharples), "The End of Russian Gas Transit via Ukraine"** — https://www.oxfordenergy.org/publications/the-end-of-russian-gas-transit-via-ukraine-immediate-impact-and-implications-for-the-european-gas-market-in-2025 — Jan 2025. *"On the morning of 1 January 2025, the flow of Russian pipeline gas via Ukraine to the EU came to a halt. It marked another milestone on the path that has seen Russian pipeline gas supply to Europe fall from a peak of 179 Bcm in 2019 to 31 Bcm in 2024. Of that 31 Bcm, 15 Bcm was delivered via Ukraine and the remaining 16 Bcm into SE Europe via the Turkish Stream pipeline."* Derivation: gives the clean 2024 two-route split, 15 / 16 bcm — the single most quotable sentence for a 2024 Ukraine-vs-TurkStream share.

### Q3.2 TurkStream (`turkstream`)

Two 15.75 bcm/y lines from Russkaya (RUS) to Kıyıköy (TUR): line 1 serves Türkiye, line 2 the Balkans via
Strandzha-2 on the Turkish–Bulgarian border.

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| RUS | SRB | 2023 | **1.00** | *"Serbia and Bosnia and Herzegovina (buying a total of about 3.1 bcm/year) receive 100% of their natural gas needs from Russia via TurkStream"* [T1] |
| RUS | BIH | 2023 | **1.00** | same sentence [T1] |
| RUS | GRC | 2023 | **1.00** | 2.7 bcm in 2023 via TurkStream [T1]; Greece's only other Russian pipeline route (Trans-Balkan) had reversed |
| RUS | HUN | 2023 | **0.93** *(derived, well corroborated)* | 5.6 bcm via TurkStream [T4] ÷ 6.41 bcm Hungary←Russia (Eurostat) = 0.87; ÷ Reuters' "6 bcm" [T2] = 0.93; S&P's ">5.5 Bcm total Russian exports to Hungary" [T3] would give ~1.0. Take 0.93 as central, 0.87–1.00 as the band |
| RUS | MKD | 2023 | **1.00** | *"less than 3% of the gas is delivered to North Macedonia"* [T1] — route share of North Macedonia's Russian gas is nonetheless total |
| RUS | ROU | 2023 | UNSOURCED | 16% of the European extension's volume reaches Romania, but much transits onward to Moldova; the Romania-consumed fraction is not published |
| RUS | TUR | 2022/2023 | **UNSOURCED** | Türkiye takes Russian gas on **two** pipelines — Blue Stream (16 bcm/y since 2003) and TurkStream line 1 — so this is one of the few genuinely non-degenerate shares, and no physical split was found. The *contractual* split is 16 bcm/y Blue Stream + 6 bcm/y TurkStream ⇒ 0.27 [T5], but that is contracted, not flowed. Türkiye's EPDK natural-gas market report publishes imports by entry point and would close it |
| RUS | BGR | 2023 | **0.00 (transit only)** | Gazprom cut Bulgargaz on 27 April 2022 [T6]; Bulgaria is a TurkStream transit state, not a Russian-gas importer, from 2022 |
| RUS | SVK | 2023 | **0.00** | Slovakia began taking TurkStream gas only in 2025 [T2] |

Citations:

- **[T1] Center for the Study of Democracy, "Phasing out Russian gas in Europe"** — https://csd.eu/fileadmin/user_upload/publications_library/files/2024_6/2024-05-29_Strategic-Decoupling_Policy-Brief_WEB__1_.pdf — 2024-05-29 (same text republished at https://perconcordiam.com/energy-decoupling-is-in-the-pipeline). *"Serbia and Bosnia and Herzegovina (buying a total of about 3.1 bcm/year) receive 100% of their natural gas needs from Russia via TurkStream. In fact, 61% of transit volumes through the European extension of the pipeline are destined for the Western Balkans and Hungary. Another 20%, or about 2.7 bcm in 2023, is shipped to Greece and 16% to Romania, covering most of the natural gas consumption of Moldova and some 10% of Romania's own gas supply. Additionally, less than 3% of the gas is delivered to North Macedonia."*
- **[T2] Reuters, "TurkStream gas pipeline could slow EU, Russia decoupling: Vladimirov"** — https://www.reuters.com/business/energy/turkstream-gas-pipeline-could-slow-eu-russia-decoupling-vladimirov-2025-05-07 — 2025-05-07. *"Since Turkstream's launch, more than 63 bcm of Russian gas has reached the EU … In 2025, Hungary has emerged as the leading importer, with Russian gas imports expected to rise to around 8 bcm, up from 6 bcm in 2023."*
- **[T3] S&P Global Commodity Insights, "Russian flows to Europe via TurkStream hit second-highest monthly level"** — https://www.spglobal.com/energy/en/news-research/latest-news/natural-gas/080224-russian-flows-to-europe-via-turkstream-hit-second-highest-monthly-level — 2024-08-02. *"Russian gas exports to Hungary in 2023 exceeding 5.5 Bcm."*
- **[T4] TASS, quoting Hungarian Foreign Minister Szijjártó** — https://tass.com/economy/1854761 — 2024-10-10. *"In 2022, 4.8 billion cubic meters of gas were delivered to Hungary via the TurkStream and its extension through Bulgaria and Serbia. As Szijjarto reported, this quantity increased to 5.6 billion cubic meters in 2023."* (State news agency quoting a minister — corroborated by [T3], not load-bearing on its own.)
- **[T5] Enerdata, "Türkiye extends year Russian gas import contracts (22 bcm/year)"** — https://www.enerdata.net/publications/daily-energy-news/turkiye-extends-year-russian-gas-import-contracts-22-bcmyear.html — *"BOTAŞ has a long-term with Gazprom for 16 bcm/year through the Blue Stream pipeline and has also been importing under shorter-term deals 6 bcm/year of Russian gas through the TurkStream pipeline."* Derivation: 6 / 22 = 0.27 **contracted** share — explicitly not a flow share.
- **[T6] OSW, "Russia halts gas supplies to Poland and Bulgaria"** — https://www.osw.waw.pl/en/publikacje/analyses/2022-04-27/russia-halts-gas-supplies-to-poland-and-bulgaria — 2022-04-27. *"On 26 April Gazprom Export (Gazprom's subsidiary) notified PGNiG, the Polish gas company, and Bulgargaz in Bulgaria that it would stop supplying gas to Poland and Bulgaria beginning from 27 April."*
- **[T7] Columbia CGEP, "Russia's Gas Export Strategy: Adapting to the New Reality"** — http://www.energypolicy.columbia.edu/wp-content/uploads/2024/02/Russia-Gas-Exports-Commentary_CGEP_021624.pdf — Feb 2024. *"Russia's pipeline exports to the EU collapsed from 140 bcm in 2021 to 63 bcm in 2022 and around 27 bcm in 2023. Those to Turkey dwindled from 26 bcm in 2021 to 22 bcm in 2022 and an estimated 21 bcm in 2023."* and, load-bearing: *"Currently, Russian gas is transported to European markets via two pathways: Ukraine and one string of the TurkStream offshore pipeline."* Derivation: this licenses attributing all non-Ukraine Russian pipeline gas in the EU in 2023 to TurkStream — 27 − 14.65 ≈ **12.4 bcm**. Independent check from Bruegel's "Other Russian gas pipeline imports" 2023 = 140 TWh ÷ 10.55 kWh/m³ ≈ **13.3 bcm**; the two agree within 7%. Note too that CGEP's Türkiye figures (26 / 22 / 21 bcm for 2021/22/23) match Eurostat's TR←RU (26.3 / 21.6 / 21.3) almost exactly — a strong independent validation of the Eurostat series recommended in Q2.

### Q3.3 Nord Stream 1 (`nord_stream`) — historical, to September 2022

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| RUS | DEU | 2021 | **~0.73, wide error bars — do not ship as fact** | 59.2 bcm NS1 throughput [N1] ÷ ~81 bcm German Russian imports (52% × 1,652 TWh ÷ 10.55 kWh/m³) [N5]. See the caveat below |
| RUS | DEU | 2022 | halted 31 Aug, sabotaged 26 Sep [N2], [N6] | *"fell to 0 TWh at the beginning of September"* [N5] |
| RUS | DEU | 2023+ | **0.00** | pipeline inoperable [N6] |

**Why 0.73 is an estimate and not a number.** The numerator (59.2 bcm) is *physical throughput of NS1*, an
unknown part of which transited onward to the Netherlands, Czechia and France rather than staying in Germany.
The denominator (859 TWh) is *declared-origin imports at German entry points*, and Germany also took Russian gas
at **Mallnow** (Yamal/Belarus) and **Waidhaus** (the Czech border, i.e. the Ukraine corridor) in 2021. Note also
that Eurostat's DE←RU 2021 figure is **55.4 bcm** against BNetzA's ~81 bcm — because BNetzA's import total
includes gas that transits Germany onward, while Eurostat reports net imports. Using Eurostat as the denominator
would give a share above 1.0, which is the clearest possible signal that the two series are not divisible. **The
authoritative split is ENTSOG physical flows at Greifswald/Lubmin vs Mallnow vs Waidhaus for 2021** — the exact
data whose licence Q2 could not clear.

- **[N1] Enerdata, "The Nord Stream pipeline transported 59.3 bcm of Russian gas to Europe in 2021"** — https://www.enerdata.net/publications/daily-energy-news/nord-stream-pipeline-transported-593-bcm-russian-gas-europe-2021.html — 2022. *"The Nord Stream pipeline transported a volume of 59.2 bcm of natural gas to Europe in 2021 (stable compared to 2020). The Nord Stream twin pipeline system, which comprise two 1,224-km offshore pipelines with a combined capacity of 55 bcm/year, runs from Vyborg (Russia) to Lubmin near Greifswald (Germany)."* (Note the headline says 59.3 and the body 59.2 — cite the body.)
- **[N2] Congressional Research Service R47468** — https://www.congress.gov/crs_external_products/R/HTML/R47468.web.html — 2023. *"Russia reduced flows through the first 55 bcm-capacity Nord Stream pipeline and eventually ceased flows entirely in September 2022. Later in September, unattributed explosions damaged both Nord Stream 1 gas lines and one from the non-operating Nord Stream 2. Gazprom also halted deliveries via the Yamal pipeline in May 2022. As a result, the share of EU natural gas imports supplied by Russia via pipeline declined from 40% in 2021 to 9% by mid-September 2022."*
- **[N5] Bundesnetzagentur, "Bundesnetzagentur publishes gas supply figures for 2022"** — http://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/EN/2023/20230105_RueckblickGas2022.html — 2023-01-06. *"The total volume of natural gas imported into Germany in 2022 was 1,449 TWh (2021: 1,652 TWh). The largest volumes came from Norway (33%) and Russia (22%; the share was 52% in 2021)."* and *"While around 1.7 TWh were still being delivered daily through Nord Stream 1 until the middle of June, those figures dropped initially by 60%, then by 80% and ultimately fell to 0 TWh at the beginning of September."* The German regulator is the best available denominator source — subject to the transit caveat above.
- **[N6] Nord Stream halt and sabotage** — Gazprom halted NS1 indefinitely from **31 August 2022** ("officially because of maintenance"); *"On 26 September 2022, a series of underwater explosions and consequent gas leaks occurred on 3 of 4 Nord Stream pipes, rendering them inoperable."* (Wikipedia, "Nord Stream pipelines sabotage" — tertiary). Corroborated by the UN Security Council Report (https://www.securitycouncilreport.org/whatsinblue/2025/08/the-nord-stream-incident-open-briefing-2.php): *"Between 26 and 29 September 2022, four leaks were detected in NS1 and NS2, near the island of Bornholm in Denmark."* Prefer [N2] (CRS) for the cessation, which is primary-grade.
- **[N7] Enerdata, "Gazprom (Russia) cuts gas supplies via Nord Stream 1 by 60%"** — https://www.enerdata.net/publications/daily-energy-news/gazprom-russia-cuts-gas-supplies-nord-stream-1-60.html — 2022-06-20. The 2022 step-down sequence: *"Gazprom has reduced gas supplies over the Nord Stream 1 pipeline to 67 mcm/d (24.5 bcm/year). Previously, in June 2022, the company cut gas supplies over Nord Stream 1 from 167 mcm/d (61 bcm/year) to 100 mcm/d (36.5 bcm/year)."* **NS1's full-year 2022 throughput remains UNSOURCED** — Bruegel's "Other Russian gas pipeline imports 2022 = 472 TWh" is an NS1 + Yamal + TurkStream composite. Bruegel's `route_data` file has a named `Nord Stream` column and is the fix.
- **[N3] Brookings, "Europe's messy Russian gas divorce"** — https://www.brookings.edu/articles/europes-messy-russian-gas-divorce — *"With a capacity of 55 bcm per year, Nord Stream became the largest source of Russian gas supply to Europe; it supplied two-thirds of Germany's total imports in 2021."* **Use with care:** "two-thirds of Germany's total imports" is the single most useful sentence for a `share(RUS, DEU, 2021)` value, but it is a think-tank characterisation without a stated denominator, and it conflicts with the more commonly cited "Russia ≈ 55% of German gas imports in 2021". Flagged, not adopted.

### Q3.4 Yamal–Europe (`yamal_europe`) — historical, to May 2022

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| RUS | POL | 2021 | UNSOURCED | Poland took gas from both Yamal–Europe and Ukraine transit; no published split |
| RUS | DEU | 2021 | UNSOURCED | Yamal–Europe nameplate 33 bcm/y [N4]; actual 2021 throughput and its German/Polish split not found |
| RUS | POL, DEU | 2022 | **0.00 from 12 May 2022** | Russia sanctioned EuRoPol GAZ, the owner of the Polish section [Y1], [Y2] |

Two distinct 2022 events, easily conflated: Gazprom cut **contractual supply to Poland** on 27 April 2022 over
rouble payment [T6]; the **pipeline itself** stopped on 12 May 2022 on the EuRoPol GAZ sanctions [Y1]. Westbound
Yamal flow was already intermittent before either — Reuters, 17 Feb 2022: *"The route has been working in a
reverse mode, shipping gas from Germany to Poland since Dec. 21."*

- **[Y1] Anadolu Agency, "Russia's Gazprom no longer to use Polish section of Yamal-Europe gas pipeline"** — https://www.aa.com.tr/en/russia-ukraine-war/russias-gazprom-no-longer-to-use-polish-section-of-yamal-europe-gas-pipeline/2586350 — 2022-05-12. *"Kupriyanov explained as sanctions apply to EuRoPol GAZ, which is the owner of the Polish section of the Yamal-Europe pipeline carrying Russian gas to Europe, Russian gas will no longer be shipped through the line."* and *"The Yamal-Europe gas pipeline … has an annual capacity of 33 billion cubic meters."*
- **[Y2] Columbia CGEP, "A Divide and Rule Game: Will Russian Gas Supplies to Europe Be Cut?"** — https://www.energypolicy.columbia.edu/publications/divide-and-rule-game-will-russian-gas-supplies-europe-be-cut — *"These flows stopped after Russia imposed sanctions on EuRoPol Gaz S.A., which owns the Polish section of the Yamal gas pipeline, on May 11. The Yamal pipeline (33 bcm/y) is therefore no longer operating."*
- **[Y3] OIES Insight 70, "Russia-Poland gas relationship"** — https://www.oxfordenergy.org/wpcms/wp-content/uploads/2020/06/Russian-Poland-gas-relationship-risks-and-uncertainties-Insight-70.pdf — *"Yamal – Europe gas pipeline reached its design capacity of 32.9 Bcm per annum."*
- **Do not use booking percentages as volumes.** Enerdata (https://www.enerdata.net/publications/daily-energy-news/poland-awards-90-yamal-gas-pipeline-capacity-2020-2021.html): *"Exporters have booked around 90% of the capacity of the Polish section of the 33 bcm/year Yamal-Europe gas pipeline … for the year between 1 October 2020 and 30 September 2021."* That is **booked capacity, not flow**, and 2021 was precisely the year Gazprom under-used its bookings. **Yamal's 2021 throughput is UNSOURCED**; Bruegel's `Yamal (BY,PL)` route column is the fix.
- **[N4] Nature Communications, "The global implications of a Russian gas pivot to Asia"** — https://www.nature.com/articles/s41467-024-55697-7 — 2024. *"The Yamal pipeline (33 bcm) also lies redundant, without a transit agreement in place between Russia and Poland."*
- Halt date corroborated by Wikipedia's Yamal–Europe article (*"On 26 April 2022, Gazprom announced it would stop delivering natural gas to Poland via the Yamal–Europe pipeline, as well as to Bulgaria"*) — a tertiary source, listed only as corroboration of [N2].

### Q3.5 TransMed / GreenStream (`transmed`)

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| DZA | ITA | 2022 | **~1.00** | TransMed is Algeria's only pipeline to Italy; it carried **22 bcm in 2022** [A1] |
| DZA | ITA | 2024 | **~1.00** | *"the gas transported through Transmed reached its lowest level since 2021, barely 21 bcm compared with a capacity of 33.5 bcm"* [A3] |
| DZA | ITA | 2023 | **~1.00** | 25.5 bcm, 41% of Italy's *total* (not pipeline) imports [A6] — re-confirm against Eurostat before shipping, it is a secondary source |
| LBY | ITA | 2022/2023 | **1.00** | *"Libya's gas exports, all of which go to Italy via the 8bcm/y (775mn cfd)-capacity Greenstream pipeline"* [A7] — a single-route, single-destination pair, now sourced |

GreenStream volumes: **3.2 bcm (2021) → 2.6 bcm (2022) → ~2.5 bcm (2023)** [A8], far below its 8–11 bcm
capacity. TransMed: contracted step-up from 21 → 30 bcm/y agreed 11 May 2022 [A9].

- **[A6] Aleanna, "Natural Gas Imports: Italy's Dependence On Algeria, Russia and Beyond"** — https://www.aleannainc.com/post/natural-gas-imports-italy-s-dependence-on-algeria-russia-and-beyond — *"Algeria has become Italy's largest supplier of natural gas, accounting for 25.5 bcm in 2023, which represents 41% of Italy's total imports … The pipeline's capacity of 33 bcm annually provides ample room for future increases."* (Secondary.)
- **[A7] MEES, "Libya Gas Exports Fall To 22-Year Low"** — https://www.mees.com/2026/1/16/oil-gas/libya-gas-exports-fall-to-22-year-low/a8ef8230-f2e2-11f0-a93a-418710887809 — 2026-01-16. Quoted above.
- **[A8] GIS Reports, "Can Italy navigate Libya's rough political waters in energy?"** — https://www.gisreportsonline.com/r/italy-libya-energy — *"Those flows have dropped from 3.2 billion cubic meters (bcm) in 2021 to 2.6 bcm in 2022."* 2023 (~2.5 bcm) from Libya Observer citing Nova: https://libyaobserver.ly/economy/gas-supplies-libya-italy-fall-30-2025.
- **[A9] CIDOB, "As North African energy links are redrawn, Italy becomes Europe's southern gas hub"** — https://www.cidob.org/publicaciones/north-african-energy-links-are-redrawn-italy-becomes-europes-southern-gas-hub — *"Italy and Algeria came to an agreement on May 11th 2022 whereby the volume of gas shipped via the TransMed (Enrico Mattei) pipeline would be increased from 21 bcm to 30 bcm by the end of 2023."*

- **[A1] S&P Global, "Algerian gas flows to Europe shrink, but Italy gains as trade ties strengthen"** — https://www.spglobal.com/energy/en/news-research/latest-news/natural-gas/013123-algerian-gas-flows-to-europe-shrink-but-italy-gains-as-trade-ties-strengthen — 2023-01-31. *"Pipeline exports to Italy via the TransMed pipeline – with its technical capacity of up to 35 Bcm/year -- totaled 22 Bcm in 2022."* Derivation: BACI's DZA→ITA 2022 is 15.2 bcm at 0.735 — 0.71× this figure (Q1.5).
- **[A3] Real Instituto Elcano, "Another round of Algerian gas for Europe"** — https://www.realinstitutoelcano.org/en/analyses/another-round-of-algerian-gas-for-europe — *"In 2024, the gas transported through Transmed reached its lowest level since 2021, barely 21 bcm compared with a capacity of 33.5 bcm. Medgaz, which directly links Algeria with Spain and whose annual capacity was increased from 8 to 10.5 bcm in 2022, carried a record 9.4 bcm in 2024."*

### Q3.6 Medgaz and MEG / Maghreb–Europe (`medgaz`, `meg`)

**MEG closed 1 November 2021**, after which Medgaz is Algeria's only pipeline to Spain. That makes the 2021 vs
2023 shares a clean, well-sourced pair — and one of the few places where a pipeline scenario would genuinely
show a structural break.

| exporter | importer | year | route | share | basis |
|---|---|---|---|---|---|
| DZA | ESP | 2021 | Medgaz | ~0.5 *(low confidence)* | 22 mcm/d × 365 = **8.03 bcm** [A10] against Spain's total Algerian pipeline imports; the MEG residual is unsourced |
| DZA | ESP | 2021 | MEG | ~0.5 *(low confidence)* | residual only — **MEG's 2021 volume is UNSOURCED** |
| DZA | ESP | 2023 | Medgaz | **1.00** | *"Algeria currently delivers natural gas to Spain exclusively through the Medgaz pipeline … after Algeria decided to abandon the 11.5 bcm/year GME … in October 2021"* [A2] |
| DZA | ESP | 2023 | MEG | **0.00** | same [A2], [A4] |
| DZA | MAR | 2022+ | MEG | **0.00** | supply to Morocco ended 1 Nov 2021 [A5] |

- **[A2] Enerdata, "Algeria will expand the capacity of the Medgaz pipeline to Spain"** — https://www.enerdata.net/publications/daily-energy-news/algeria-will-expand-capacity-megaz-pipeline-spain-13.html — *"Algeria currently delivers natural gas to Spain exclusively through the Medgaz pipeline, which already operates at full capacity, after Algeria decided to abandon the 11.5 bcm/year GME (Gaz Maghreb Europe) gas pipeline crossing Morocco to supply Spain and Portugal, due to tensions with Morocco, in October 2021."*
- **[A4] Reuters, "Algeria to end gas supplies to Morocco; supply Spain directly"** — https://www.reuters.com/world/africa/algeria-end-gas-supplies-morocco-supply-spain-directly-sources-2021-10-25 — 2021-10-25. *"Algeria … will stop supplying natural gas to the country through the Maghreb-Europe pipeline from Nov. 1 … The 13.5 billion cubic-metre (bcm) Maghreb-Europe pipeline links Algeria to Spain. Algeria will keep supplying Spain using the Medgaz undersea pipeline with an annual capacity of 8 bcm, which does not go through Morocco."*
- **[A10] The National** — https://www.thenationalnews.com/business/energy/2022/07/25/algeria-temporarily-suspends-gas-supplies-to-spain-amid-pipeline-malfunction — 2022-07-25. *"Medgaz is the only pipeline currently operational between Spain and Algeria after supplies through the GME pipeline were suspended late last year due to a row between Algeria and Morocco."* and *"In 2021, Algerian gas exports via the Medgaz pipeline averaged 22 million cubic metres per day, data from S&P Global Commodity Insights showed."* Derivation: 22 mcm/d × 365 = 8.03 bcm — an annualised daily average from a paywalled dataset reported secondhand, hence the low confidence.
- **[A11] Enerdata, Medgaz capacity expansion** — https://www.enerdata.net/publications/daily-energy-news/algeria-will-expand-capacity-megaz-pipeline-spain-13.html — *"The capacity of the Medgaz submarine gas pipeline between Algeria and Spain will increase from 8 bcm/year to 10.7 bcm (+34%) by the end of 2021 with the entry into service of a third turbo compressor."* GEM concurs (https://www.gem.wiki/Medgaz_Gas_Pipeline): *"Total capacity of 10.7 bcm/y as of 2022"*.
- **The clean fix for the 2021 split:** Enagás's *Boletín Estadístico* publishes Spanish entry-point volumes monthly — **Tarifa = MEG, Almería = Medgaz**. That is the definitive source and it was not reached in this research. Failing that, Eurostat `geo=ES, partner=DZ`, G3000 − G3200 gives the 2021 Algerian pipeline total, from which the MEG residual follows once Medgaz is pinned.
- **[A5] Global Energy Monitor, "Maghreb-Europe Gas Pipeline"** — https://www.gem.wiki/Maghreb-Europe_Gas_Pipeline — *"As from 1 November 2021, Algerian gas is no longer exported to and through Morocco, through the Maghreb-Europe Gas Pipeline … The gas sales agreement between Algeria and Morocco expired on the same date as the transit contracts linking Spain and Portugal to Morocco."* (CC BY 4.0, already an attributed source in this project.)

### Q3.7 Norway → EU system (`norway_system`)

The best-sourced route in this whole note, because Gassco publishes per-market delivery volumes [G1].
Norwegian gas reaches each market on a dedicated pipe, so the route share of each pair is effectively 1.00 —
which also means a "cut the Norwegian system" scenario is really a supplier-outage scenario, not a route one.

| exporter | importer | year | share | Gassco volume (bcm) |
|---|---|---|---|---|
| NOR | DEU (+DNK) | 2022 / 2023 | 1.00 (Europipe I+II, Norpipe) | 55.6 / 56.2 |
| NOR | GBR | 2022 / 2023 | 1.00 (Langeled, Vesterled, Tampen Link) | 27.9 / 24.1 |
| NOR | FRA | 2022 / 2023 | 1.00 (Franpipe) | 17.8 / 13.8 |
| NOR | BEL | 2022 / 2023 | 1.00 (Zeepipe) | 15.6 / 15.0 |
| NOR | POL | 2023 | 1.00 (Baltic Pipe) | **not in the Gassco table at all** — Gassco lists only Germany/Denmark, UK, France, Belgium, so Baltic Pipe (10 bcm/y from Sept 2022) is UNSOURCED here; Eurostat `geo=PL, partner=NO` gives it |

System totals: **113.2 (2021) → 116.9 (2022) → 109.1 (2023) → 117.6 bcm (2024, a record)**. 2024 per market:
Germany/Denmark 56, UK 30, France 16, Belgium 16 (Gassco, "Record delivery of natural gas in 2024",
https://gassco.eu/en/record-delivery-of-natural-gas-through-the-gas-transport-system-to-europe-in-2024:
*"A total of 117.6 billion cubic meters (BCM) of gas was transported from the NCS to Europe, equivalent to 1,295
terawatt hours (TWh) of energy."*). Note Reuters' explainer records the system as *"22 individual pipelines"* —
the seven trunks in the GEM table below are the landfall lines, not the whole network.

Per-pipe attribution within the German total is **UNSOURCED**: Gassco reports by market, not by pipe, and
reports Germany and Denmark together because of the Europipe II Denmark offtake [G1].

### Q3.8 Power of Siberia (`power_of_siberia`)

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| RUS | CHN | 2023 | **1.00** of the RUS→CHN pipeline pair | PoS-1 was Russia's only operating gas pipeline to China in 2023 |
| RUS | CHN | 2023 | **0.34** of China's *total* pipeline gas imports | stated explicitly by CGEP [P1] |

Ramp (bcm): **4.1 (2020) → 10.4 (2021) → 15.4 (2022) → 22.7 (2023) → >31 (2024)**, reaching the **38 bcm/y**
design rate on 1 December 2024, a month early [P3]. Power of Siberia 2 is `proposed` in GEM (P5409, P0734) and
carries no flow.

Two reference values disagree and the difference matters: **CGEP/OSW say 22.7 bcm for 2023 [P1], [P2]; the EI
2026 workbook says 21.5 bcm [G3]**. The ~5% gap is the usual bcm-definition difference (Gazprom's shipped volume
vs EI's standard-cubic-metre normalisation). Either is defensible; pick one and state it. BACI's 13.0 bcm is
outside both by 40%+.

- **[P1] Columbia CGEP, "The Future of the Power of Siberia 2 Pipeline"** — https://www.energypolicy.columbia.edu/publications/the-future-of-the-power-of-siberia-2-pipeline — *"It increased deliveries through the Power of Siberia 1 (PS-1) pipeline from 10.4 bcm in 2021 to 22.7 bcm in 2023, accounting for 34 percent of China's pipeline gas imports."*
- **[P2] OSW, "Gazprom in 2023: exports to Europe stabilise, China's importance grows"** — https://www.osw.waw.pl/en/publikacje/analyses/2024-02-02/gazprom-2023-exports-to-europe-stabilise-chinas-importance-grows — 2024-02-02. *"Gazprom reported an increase in its sales to China: it shipped 22.7 bcm of gas there via the Power of Siberia-1 pipeline, a 47% increase from 2022. As a result, China became the largest single importer of Russian pipeline gas."*
- **[P3] TAdviser, "Power of Siberia"** — https://tadviser.com/index.php/Article:Power_of_Siberia — *"The Power of Siberia gas pipeline reached its maximum design capacity of 38 billion cubic meters of gas per year from December 1, 2024, which is a month ahead of schedule, Gazprom said."*
- **[P4] Global Energy Monitor, Power of Siberia** — https://www.gem.wiki/Power_of_Siberia_Gas_Pipeline — *"Export volumes to China via the pipeline: 4.1 bcm in 2020, 8.2 bcm in 2021, 15.4 bcm in 2022, 22.7 bcm in 2023 (including 5.4 bcm via the 'Kovykta–Chayanda' section)."* **GEM's 2021 figure (8.2) conflicts with CGEP's and Gazprom's (10.4); prefer 10.4.** CC BY 4.0, already an attributed source here.

**One negative is asserted by implication, not by a source:** that PoS-1 was the *only* Russia→China gas pipeline
in 2023. [P1] and [P2] both attribute the whole 22.7 bcm to it, which implies it, but the Far Eastern (Sakhalin)
route's commissioning date was not established. Pull Gazprom's own announcement before asserting it on the site.

### Q3.9 Central Asia–China (`central_asia_china`)

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| TKM | CHN | 2023 | **1.00** | lines A/B/C are Turkmenistan's only export route to China |
| KAZ, UZB | CHN | 2023 | **1.00** | same corridor |

Design capacity **55 bcm/y**: lines A+B (30 bcm, commissioned 2009–10) plus line C (25 bcm, 2014) — OIES NG-155,
https://www.oxfordenergy.org/wpcms/wp-content/uploads/2019/12/Central-Asian-Gas-NG-155.pdf: *"Lines A and B of the
corridor, with a capacity of 30 Bcm … were commissioned in 2009–10, and Line C, with a capacity of 25 Bcm, in
2014."*

| Metric | Value | Source |
|---|---|---|
| TKM→CHN 2022 volume | **34.09 bcm** | [C1] |
| TKM share of China's pipeline imports, 2022 | **0.54** | [C1] |
| RUS share of China's pipeline imports, 2022 | 0.27 | [C1] |
| China total pipeline imports, 2023 | ~66.07 bcm | [C1] |
| TKM share of China's pipeline imports, 2023 | **~0.45–0.50 (derived, not sourced)** | see below |
| TKM→CHN 2023 **volume in bcm** | **UNSOURCED** | — |

- **[C1] News Central Asia, citing S&P Global Commodity Insights** — https://www.newscentralasia.net/2023/12/22/petrochina-mulls-construction-of-line-d-of-turkmenistan-china-gas-pipeline-in-2024 — 2023-12-22. *"Turkmenistan is China's biggest pipeline gas supplier, which sent 34.09 Bcm of natural gas via the Central Asia gas pipeline in 2022, accounting for 54% of China's total pipeline gas imports, much higher than 17.1 Bcm or 27% from Russia last year, data from S&P Global Commodity Insights showed."* and *"China's total pipeline gas imports are estimated to be around 66.07 Bcm in 2023, up around 5% year on year."*
- Derivation of the 2023 band: CGEP puts Russia at 34% of China's 2023 pipeline imports [P1]; 34% × 66.07 = 22.5 bcm, which matches the PoS figure of 22.7 — so the two sources are internally consistent. Turkmenistan held 54% in 2022 while Russia rose 27% → 34%, so Turkmenistan necessarily fell; **0.45–0.50 is the defensible band, not a sourced number** (≈30–33 bcm).
- Independent cross-check on a different basis — Reuters' John Kemp, https://jkempenergy.com/tag/turkmenistan: *"The rest came by pipeline, mainly from Turkmenistan (22 million tonnes), Russia (16 million), Kazakhstan (3 million) and Myanmar (3 million)."* By mass, 22/44 = **0.50**, inside the band. (Tonnes ≠ bcm; use this only as a share check.)

EI [G3] gives China's pipeline imports from "Other CIS" (TKM + KAZ + UZB combined) as **37.9 bcm in 2023**
(41.7 in 2021, 40.5 in 2022, 38.3 in 2024, 36.7 in 2025). The 2025 bilateral matrix in the same workbook splits
2025 as Turkmenistan 30.3, Kazakhstan 4.9, Uzbekistan 1.5 bcm. **The per-country split for 2023 is UNSOURCED** —
EI publishes only the aggregate for historical years, and **Kazakh and Uzbek 2023 volumes are UNSOURCED** in bcm
from any source found.

**A Q1 postscript that lands here.** The World Bank's WITS mirror of UN Comtrade reports China's 2023 HS 271121
import from Turkmenistan as `9,606,032.07` thousand USD and `14,303,000,000` kg — **exactly** the value and
quantity in BACI (§Q1.5: 9.61 bn USD, 14,303,037 t). So BACI's figure is simply China's Comtrade declaration
passed through. Kemp's 22 Mt and S&P's 34.09 bcm both contradict it by ~50%. That is independent confirmation
that the defect documented in Q1 is inherited from the underlying customs declarations, not introduced by BACI —
and therefore that **UN Comtrade is no escape route either**. The project's existing `comtrade_monthly` layer is
crude and LNG only; do not extend it to 271121.

### Q3.10 GEM pipeline IDs for highlighting

Route → GEM `pipeline_id`, from `data/raw/gem_gas_infra/ggit_map_2026-02-20.geojson`. **`IN`** = present in the
shipped `public/data/pipelines.geojson`; **`OUT`** = dropped by `STATUS_MAP` in
`scripts/transform/build_pipelines.py`, which keeps only `operating` and `construction`.

| Route | pid | In sidecar? | GEM status | Name | Endpoints |
|---|---|---|---|---|---|
| Ukraine transit | P0768 | IN | operating | Urengoy-Pomary-Uzhgorod Gas Pipeline | RUS→UKR |
| Ukraine transit | P0774 | IN | operating | Progress Gas Pipeline | RUS→UKR |
| Ukraine transit | P0761 | **OUT** | mothballed | Soyuz Gas Pipeline | RUS→UKR |
| Ukraine transit | P0777 | IN | operating | Kyiv–Western Border Pipeline | UKR→UKR |
| Ukraine transit | P1480 | IN | operating | Kyiv–Western Border of Ukraine Gas Pipeline | UKR→UKR |
| Ukraine transit | P3063 | IN | operating | Uzhgorod–Velke Kapusany Gas Pipeline | UKR→SVK |
| Ukraine transit | P1489 | IN | operating | Vojany-Uzhgorod Gas Pipeline | SVK→UKR |
| Ukraine transit | P2903 | IN | operating | Ozdany-Velke Kapusany Gas Pipeline | SVK→SVK |
| Ukraine transit (Trans-Balkan) | P3933 | IN | operating | Trans-Balkan Gas Pipeline | TUR→ROU |
| TurkStream | P0765 | IN | operating | TurkStream Gas Pipeline | RUS→TUR |
| TurkStream | P1368 | IN | operating | TurkStream Gas Pipeline | RUS→TUR |
| TurkStream (onward) | P2085 | IN | operating | Balkan Stream Gas Pipeline | BGR→BGR |
| TurkStream (onward) | P1336 | IN | operating | Bulgaria-Serbia Interconnector Gas Pipeline | BGR→SRB |
| TurkStream (onward) | P1331 | IN | operating | Serbian-Hungarian Gas Pipeline | SRB→HUN |
| Blue Stream | P0736 | IN | operating | Blue Stream Gas Pipeline | RUS→TUR |
| **Nord Stream 1** | **P0753** | **OUT** | mothballed (`stopyear` 2022) | Nord Stream Gas Pipeline | RUS→DEU |
| **Nord Stream 2** | **P0752** | **OUT** | mothballed | Nord Stream 2 Gas Pipeline | RUS→DEU |
| **Yamal–Europe** | **P0769** | **OUT** | idle | Yamal-Europe Gas Pipeline | RUS→DEU |
| Yamal–Europe 2 | P0806 | OUT | cancelled | Yamal Europe 2 Pipeline | BLR→SVK |
| TransMed | P6648 | IN | operating | Trans-Mediterranean Gas Pipeline | DZA→TUN |
| TransMed | P6649 | IN | operating | Trans-Mediterranean Gas Pipeline | TUN→ITA |
| TransMed | P6539, P6561, P6564, P6650 | IN | operating | Trans-Mediterranean Gas Pipeline (segments) | DZA / ITA internal |
| GreenStream | P0439 | IN | operating | Greenstream Gas Pipeline | LBY→ITA |
| Medgaz | P2055 | IN | operating | Medgaz Gas Pipeline | DZA→ESP |
| Medgaz | P1836, P6647 | IN | operating | Medgaz Gas Pipeline (segments) | DZA internal |
| MEG (Maghreb–Europe) | P0453 | IN | operating | Maghreb-Europe Gas Pipeline | DZA→ESP |
| Norway→EU | P0690 | IN | operating | Europipe II Gas Pipeline | NOR→DEU |
| Norway→EU | P0712 | IN | operating | Norpipe Gas Pipeline | NOR→DEU |
| Norway→EU | P0689 | IN | operating | Europipe I Gas Pipeline | GBR→DEU *(GEM start-country looks wrong; should be NOR)* |
| Norway→EU | P0692 | IN | operating | Franpipe Gas Pipeline | NOR→FRA |
| Norway→EU | P1770, P7443, P7444 | IN | operating | Zeepipe Gas Pipeline | NOR→BEL |
| Norway→EU | P0704 | IN | operating | Langeled Gas Pipeline | NOR→GBR |
| Norway→EU | P0729 | IN | operating | Vesterled Gas Pipeline | NOR→GBR |
| Norway→EU | P1895 | IN | operating | Tampen Link Gas Pipeline | NOR→GBR |
| Norway→EU | P0684, P2265, P2266 | IN | operating | Baltic Pipe Project | NOR→POL |
| Power of Siberia | P2352, P2353 | IN | operating | Power of Siberia Gas Pipeline | RUS internal |
| Power of Siberia | P7600 | IN | construction | Power of Siberia Gas Pipeline | RUS internal |
| Power of Siberia 2 | P5409, P0734 | OUT | proposed | Power of Siberia 2 Gas Pipeline | RUS→CHN |
| Central Asia–China | P1124, P2299, P2300 | IN | operating | Central Asia–China Gas Pipeline | TKM→CHN |

**Finding:** the three most important *historical* routes — **Nord Stream (P0753), Nord Stream 2 (P0752) and
Yamal–Europe (P0769)** — plus Soyuz (P0761) are **not in the shipped sidecar** because
`STATUS_MAP = {"operating", "construction"}` drops `mothballed` and `idle`. Route geometry for all four **is**
present in `data/raw/gem_pipeline_routes/gas-pipelines/` (P0752, P0753, P0761, P0769, P0806 all have
`.geojson` files), so this is a transform-filter decision, not a data gap. A pipeline-gas scenario that cannot
draw Nord Stream is not worth shipping, so any implementation must first widen `STATUS_MAP` to admit
`mothballed` / `idle` / `retired` as a distinct `historical` status and give it its own symbology — a small but
real change with e2e, Legend and vintage-filter consequences.

**Second finding:** `disruption_route.parquet` has **no `year` column** (`disruption_id, kind, exporter_iso3,
importer_iso3, share, source, source_title, source_url, source_year, source_note`), and `src/lib/export/scenario.ts`
already discloses shares as *"static across years"*. For oil chokepoints that is defensible. For Russian pipeline
routes it is not: the Ukraine-transit share of Slovakia's Russian gas, or the Nord Stream share of Germany's,
changes by more than an order of magnitude between 2021 and 2023. **Pipeline-gas scenarios require a year
dimension on route shares** — schema change, transform change, engine lookup change, panel and CSV change.

---

## Q4 — Commodity-axis recommendation

### What exists today

- `Commodity = "oil" | "gas"` (`src/lib/scenarios/types.ts`), surfaced as an Oil | Gas toggle and as
  `?commodity=oil|gas` in the URL (`src/lib/url-state/encode.ts`, with a fallback to the mode default).
- One map from commodity to HS code: `HS_BY_COMMODITY = { oil: "2709", gas: "271111" }`
  (`src/lib/data/scenario-inputs.ts`). One file, one line.
- One map from (scenario, commodity) to route-share key: `routeKeyFor()` in `src/lib/scenarios/registry.ts`,
  which already returns `"hormuz_lng"` for `hormuz` + `gas`. **Route keys are already decoupled from scenario
  ids**; the parquet holds `hormuz`, `hormuz_lng`, `druzhba`, `cpc`, `btc`.
- Gas-axis quantities are **tonnes** end to end (engine, `ImporterImpact.totalQty`, CSV `qty_unit`), displayed as
  Mt; oil is tonnes displayed as kb/d via `BARRELS_PER_TONNE_CRUDE`.
- **Since this note began, the S5 work landed and it helps.** Share resolution moved out of `engine.ts` into
  `src/lib/scenarios/shares.ts` (`resolveScenarioShare`, `combineShares`, `ShareBounds`); `RouteRow` is now a
  union admitting an inbound wildcard (`exporter_iso3: null`); the engine gained a `severity` multiplier, a
  combined-scenario lower/upper range and a symmetric `byExporter` view. **`shares.ts` is now the single clean
  place to add the year dimension** — the change described below got cheaper, and `lookupBounds` is the one
  function that needs a `year` argument threaded through it.
- Per-terminal LNG attribution (`lng-t3.ts`, `lng.ts`, `lng-in-service.ts`) keys off `LngImportRow` and voyage
  data and is meaningful **only for LNG**. A pipeline cut has no terminal.
- `howComputed()` and `scenarioHeader()` both branch on `commodity === "gas"` and hardcode the phrase
  "LNG (HS 271111)".

### The three options

**(a) A third axis, `commodity = "pipeline_gas"`.**
Mechanically the cheapest: add the literal to `Commodity`, one entry to `HS_BY_COMMODITY`, one branch in
`routeKeyFor`, new copy in `howComputed`/`scenarioHeader`, skip the LNG-terminal path when the commodity is
pipeline gas, and add the option to the toggle. URL back-compat is free: `commodity=gas` is untouched and old
links render identically. Costs: a three-way toggle is a worse control than a two-way one, and it asks the
researcher to answer "which pipe?" before they can ask "how exposed is Germany?" — which is the wrong order. It
also makes the two gas numbers non-additive on screen without ever showing the sum.

**(b) `gas` = LNG + pipeline combined, exposure computed on total gas imports; each scenario declares which mode
it cuts.**
Analytically the right answer — "42% of Germany's gas imports are at risk" is the statement a policy researcher
wants, and a Hormuz-LNG cut expressed against *total* gas is the honest denominator. But it is by far the most
expensive: the engine's `totalQty` denominator must become a union over two source tables with different
reliability; `ImporterImpact` needs a mode breakdown; the terminal attribution has to be conditioned on the
scenario's mode; `shareAtRisk` changes value for **existing** scenarios, so every `commodity=gas` link silently
renders different numbers than the day it was shared — a direct violation of the URL back-compat rule in
CLAUDE.md. And it is only worth building if the pipeline half is trustworthy, which per Q1 it is not.

**(c) Keep the datasets separate; let each scenario declare its own dataset.**
`ScenarioDef` gains a `gasMode: "lng" | "pipeline" | "both"`; `loadScenarioInputs` picks the HS code from the
scenario rather than from the toggle; the toggle keeps two positions. Hormuz stays LNG, Ukraine transit is
pipeline-only and the panel labels it so. This preserves every existing URL exactly (nothing about `hormuz` +
`gas` changes) and avoids the three-way toggle, at the cost of the toggle no longer fully determining what is
shown — a scenario can override it.

### Recommendation

> **(c), with (b) as the eventual destination — and neither until Q1/Q2 produce a trustworthy pipeline dataset.**
>
> (c) is the smallest change that keeps existing shared links byte-identical while letting a pipeline scenario
> exist at all, and it matches the precedent already set by `routeKeyFor()` / `hormuz_lng`: the scenario, not the
> toggle, decides which route table and which trade table it reads. (b) is the better product but it re-prices
> every existing `commodity=gas` share, and it is not worth paying that cost for a pipeline denominator we cannot
> source.

**Sizing for (c)** (excluding the data work, which is the real cost):

| Change | Files | Size |
|---|---|---|
| `gasMode` on `ScenarioDef`; default `"lng"` for the four existing scenarios | `src/lib/scenarios/registry.ts` | XS |
| HS selection from scenario, not commodity | `src/lib/data/scenario-inputs.ts` (`HS_BY_COMMODITY` → function of scenario) | XS |
| Skip terminal attribution when `gasMode === "pipeline"` | `src/lib/scenarios/engine.ts` | S |
| Year dimension on route shares (see Q3 finding) — `year` column, share lookup becomes (exporter, importer, year) with a null-year fallback so existing rows keep working | `disruption_route` schema, `scripts/transform/build_disruption_routing.py`, `src/lib/data/scenario-inputs.ts`, **`src/lib/scenarios/shares.ts`** (post-S5 this is the only engine-side file) | **M** |
| Copy: `howComputed`, `scenarioHeader`, panel labels | `registry.ts`, `src/lib/export/scenario.ts`, `ScenarioPanel.tsx` | S |
| `historical` pipeline status so Nord Stream / Yamal–Europe can be drawn | `scripts/transform/build_pipelines.py`, symbology, Legend, e2e | **M** |
| Unit handling: pipeline gas is naturally **bcm**, the gas axis is tonnes | display layer + CSV `qty_unit` | S |
| Catalog entry + `/methodology` + `LICENSE-DATA.md` for the new source | `build_catalog.py`, docs | S |
| Tests: engine unit tests for the year-aware lookup; e2e for the new scenario | `tests/unit/`, `tests/e2e/` | M |

Roughly **two M-sized changes (year-aware route shares, historical pipeline status) plus a handful of XS/S
edits** — call it a focused phase, not a sprint. The data sourcing dominates.

**Units note.** If a pipeline dataset is adopted it will be in **bcm**, not tonnes. Do not convert bcm→tonnes to
fit the existing gas axis: Q1.5 shows the implied density varies 0.21–0.89 kg/m³ across pairs, so any single
factor bakes in an error we just spent this note documenting. Carry the native unit on the row
(`qty_unit` already exists in `trade_flow`) and let the engine work per-commodity in its own unit — shares are
dimensionless, so only the display and CSV need to know.

---

## Go / no-go

### GO — European pipeline-gas scenarios, on Eurostat

Build **Ukraine transit, TurkStream, Nord Stream, Yamal–Europe, TransMed/GreenStream, Medgaz/MEG and
Norway→EU**, with the trade matrix from Eurostat `nrg_ti_gas` (`siec` G3000 minus G3200, `unit=MIO_M3`) rather
than BACI.

Why this clears the project's usual bar:

- **The data is right where it matters.** Eurostat has Russia→Germany (55.4 bcm, 2021) and Russia→Türkiye
  (21.6 bcm, 2022); BACI has neither. Spot checks against three independent sources agree within a few percent.
- **The licence is better than the LNG axis already ships.** CC BY 4.0 makes it *downloadable* under
  `LICENSE-DATA.md`, unlike the EI reserves and BACI trade already on the site.
- **Units get simpler, not harder.** Million m³ is native; no tonne conversion, and therefore none of the
  0.21–0.89 kg/m³ ambiguity documented in Q1.5.
- **The coverage window fits.** Annual 1990–2024 matches the existing year slider exactly.
- **The route shares are largely sourceable** (Q3), and where they are not, the existing `UNSOURCED_TITLE`
  mechanism already handles it honestly in the panel and CSV.

### NO-GO — the non-European routes

**Power of Siberia, Central Asia–China and Canada→US are out of scope.** Eurostat has no non-European reporters;
BACI understates these pairs by 1.6–3.5× (Q1.5); EI publishes only region aggregates for historical years. There
is no free source with the granularity. Do not ship these with a caveat — ship them not at all, or the map will
imply a precision that does not exist. Note that `Power of Siberia 2` is `proposed` in GEM and carries no flow
anyway.

### Prerequisites before any of this is worth starting

Three things must be true first, and none is optional:

1. **`disruption_route` needs a `year` column.** The share of Slovakia's Russian gas moving via Ukraine is 1.00
   in 2023 and 0.00 in 2025; the share via Nord Stream is material in 2021 and zero from 2023. The current
   schema has no year dimension and the CSV export already admits shares are *"static across years"*. Shipping
   pipeline-gas scenarios on static shares would be the same class of error this note was written to avoid.
2. **`build_pipelines.py` must admit historical statuses.** Nord Stream (P0753), Nord Stream 2 (P0752),
   Yamal–Europe (P0769) and Soyuz (P0761) are all filtered out by `STATUS_MAP = {operating, construction}`.
   Route geometry for all four exists in `data/raw/gem_pipeline_routes/gas-pipelines/`. A Nord Stream scenario
   that cannot draw Nord Stream is not shippable.
3. **The corridor-attribution question in Q3.0 must be answered.** For Ukraine transit, the operator publishes
   volumes by *entry point* (Slovakia 73% of the 2019–24 contract) while Eurostat reports by *importing country*
   (Slovakia's own Russian imports were only 3.5 bcm in 2021). These are different quantities and the scenario's
   share table must pick one basis and say so on the methodology page. **This is the real open design problem**,
   and it is analysis we would be authoring, not citing.

### Sequencing

Do (1) and (2) as their own small PR — both are independently useful, and (1) in particular improves the honesty
of the *existing* oil scenarios. Then a Eurostat ingest + transform, then one scenario end to end (**Ukraine
transit** is the best first: cleanest sources, sharpest 2021→2023→2025 story, and it is the one a policy
researcher would actually come to this map for). Only then the rest.

Rough total: two M-sized platform changes, one new ingest + transform, one new commodity path per Q4(c), and
per-scenario share tables. A focused phase.

---

## Open questions for the maintainer

Ordered by how much they block the work.

**1. Which basis do the pipeline share tables use — entry point or destination country?** (Blocking.)
Q3.0 shows Slovakia 2023 has three defensible numbers: 12.67 bcm entered, 4.3 bcm was consumed, 2.88 bcm was
declared as imports. `disruption_route` is destination-family and Eurostat is destination-family, so the
consistent answer is *destination* — but that makes a "cut Ukraine transit" scenario rank Austria (5.7 bcm) above
Slovakia (3.2 bcm), which will surprise anyone who reads the transit headlines. **This is a product decision, not
a data one,** and it must be stated on `/methodology` either way.

**2. Is a year dimension on `disruption_route` acceptable scope?** (Blocking.)
It is the largest single change, it touches the transform, the parquet schema, the engine lookup, the panel and
the CSV header — and it also changes the *existing* oil scenarios, whose shares are currently static and
disclosed as such. Doing it improves them; doing it means re-reviewing them.

**3. Should `build_pipelines.py` carry `mothballed` / `idle` / `retired` pipelines?** (Blocking for Nord Stream.)
Geometry for P0752, P0753, P0761, P0769 already sits in `data/raw/gem_pipeline_routes/`. Admitting them needs a
third status value, its own symbology, a Legend entry, and a decision on how they interact with the year slider
(a `stopyear` is effectively a decommissioning date, which the vintage filter does not currently model). It also
affects the oil axis, where Druzhba's northern branch has the same problem.

**4. Archive Bruegel's legacy `route_data` ZIP to R2 now?** (Time-sensitive, cheap.)
It is the only published series carrying `Nord Stream`, `Yamal (BY,PL)`, `Ukraine Gas Transit` and `Turkstream`
as named columns, it is the direct fix for the two largest UNSOURCED gaps in Q3 (Yamal 2021, Nord Stream 2022),
and Bruegel has announced the legacy file *"will no longer be updated"* after its September 2026 pipeline
revision. Archiving costs one `aws s3 cp` and commits us to nothing. **Recommend doing this regardless of the
go/no-go.**

**5. Get Bruegel's dataset licence confirmed in writing.** Their dataset page grants transform-and-distribute;
their site-wide publications policy says CC BY-**ND**. The specific instrument should govern, but
`LICENSE-DATA.md` should not rest on a lawyer's argument. One email.

**6. Does Eurostat's non-EU commercial-reuse carve-out reach the `partner` dimension?** Only bites if the site
ever monetises, but the answer should be on file before then. One question to Eurostat user support.

**7. Re-pin the EI licence wording.** The redistribution text quoted in Q2.2 — including the decisive *"The
redistribution or reproduction of data whose source is S&P Global Commodity Insights … is strictly prohibited"* —
was reached via a third-party mirror of the **2025 (74th)** edition PDF. `docs/data-sources.md` and
`LICENSE-DATA.md` currently assert EI's terms; they should cite the 2026 edition's own wording. The PDF is behind
an email gate, so this needs a human.

**8. Worth asking ENTSOG for written consent?** It is the only source that can answer the physical-route
questions (Nord Stream's share of German 2021 imports, per-pipeline Norwegian splits) and its two governing
documents contradict each other on redistribution. A single email could unlock the highest-fidelity European
data in this note — or close the option cleanly.

**9. Do we want the LNG and pipeline gas axes to ever show a combined total?** Q4 recommends option (c) and
flags (b) as the better product that costs URL back-compat. If the answer is "eventually yes", (c) should be
built with that in mind (e.g. `ImporterImpact` carrying a mode tag from day one) even though the combined view
ships later.

**10. Türkiye's Blue Stream vs TurkStream split.** The one genuinely non-degenerate Russian route share in the
set, and unsourced. Türkiye's EPDK publishes a natural-gas market report with imports by entry point. Worth a
look only if a TurkStream scenario is actually built.

## Addendum — corrections received after the report (2026-09-19)

> **Superseded in part — read the Verification section below first.** The verifier found three of this addendum's provenances fabricated or misattributed: no source says Gassco "restated 54.8 → 55.6" (Reuters simply gives 55.6 for 2022); the Lowy Institute piece contains no Turkmen volume; Al-Attiyah's 32.9 bcm is *all* non-Russian pipeline gas; the Adriatic LNG citation cannot support pipeline entry points. The Enagás Medgaz/MEG split and the Gassco four-country shares were confirmed.

A sub-researcher on scenarios 5–9 reported after the main text was written. Where this conflicts with Q3, this wins.

- **Medgaz / MEG 2021 split is sourced** (replaces the "~0.5, low confidence" row): DZA→ESP 2021 Medgaz **0.574** (Almería 88,688 GWh ÷ 154,565), MEG/GME **0.426** (Tarifa 65,877 GWh); 2023 Medgaz 1.000 / GME 0.000. Source: Enagás, *Boletín Estadístico del Gas – Diciembre 2021*, §2.1, full-year column — https://www.enagas.es/content/dam/enagas/es/ficheros/gestion-tecnica-sistema/energy-data/publicaciones/boletin-estadistico-del-gas/Boletin-Estadistico-Gas-diciembre-2021.pdf. The two entry points sum to Sedigas' "Argelia GN 2021 = 154.6 TWh" (https://www.sedigas.es/informeanual/2023/el-gas-en-espana/aprovisionamientos). Keep Spain in GWh: no source gives Enagás's GCV factor. Medgaz capacity: state the range 8.0 → 10.5–10.7 bcm/y (EIA id=56580; Elcano).
- **Turkmenistan→China 2023 share is withdrawn — UNSOURCED.** Three estimates disagree by nearly 2× (China-reported HS 271121 → 19.7 bcm; residual from IEEFA's 69.2 bcm total → 36–37 bcm; Al-Attiyah Foundation 32.9 bcm). Cause, per Columbia CGEP: December 2021 is the last month Chinese Customs published country-level pipeline-gas volumes, so every later country split is an estimate. Sourced for 2023: KAZ→CHN 5.857 bcm (Astana Times, Nov 2024); TKM→CHN 2022 = 35 of 64.8 bcm = 0.54 (Lowy Institute, 13 Dec 2023).
- **Italy:** TransMed and GreenStream pair shares of 1.00 confirmed by enumeration of entry points (Adriatic LNG, *Dati Operativi 2023*). As shares of Italy's pipeline imports: TransMed 0.41 (2022), 0.51 (2023); GreenStream 0.05, 0.07 — from Terna, *Documento di Descrizione degli Scenari 2024*, Fig. 44 (chart labels rounded to whole Gm³, ±0.5).
- **Norway→Germany 2022 is 55.6 bcm, not 54.8** — Gassco restated it once Denmark-branch volumes were included (Reuters, 10 Jan 2024). 2022 shares of Gassco deliveries: DEU 0.476, GBR 0.239, FRA 0.152, BEL 0.133; totals close on Gassco's key figures (116.9 in 2022, 109.1 in 2023 — https://gassco.eu/en/about-us/what-we-do/key-figures). Gassco excludes Norwegian gas reaching Britain on non-Gassco lines, so GBR is understated.
- **Power of Siberia:** carry the share of China's pipeline imports as a range 0.325–0.34 (IEEFA 22.5 ÷ 69.2 vs CGEP), not a point. The Far Eastern Route is contracted for 2027, so PoS-1 = 1.00 of RUS→CHN pipeline gas through 2024.

None of the addendum's figures has been through the independent verification pass that the chokepoint and oil-pipeline notes received.

---

## Verification (independent, 2026-09-19)

Every figure, quote and licence reading above was re-checked against the primary source by a verifier who did not
write the note. BACI was re-extracted from the pinned CEPII zip; the Eurostat API was queried live; the EI
workbook was read from the repo; every Q3 URL was re-opened; the three prerequisites were checked against the
repo. Method notes are inline in the table.

**Headline: Q1 is confirmed to the tonne, and Q3's *numbers* survive far better than the two sibling notes did —
but Q2's central recommendation has a hole the note does not know about. Eurostat has the same hub-re-export
defect the note holds against BACI, and for three of the countries the marquee scenario exists to rank
(Austria, Moldova, Poland) it has no usable partner detail at all.**

### Verdict table

Grouped by section. "corrected value" is blank where CONFIRMED.

#### Q2.0–Q2.2 — the Eurostat licence claim (priority 1)

| claim | verdict | what the source says | corrected value |
|---|---|---|---|
| `nrg_ti_gas` data is redistributable with attribution | **CONFIRMED** (on evidence the note does not cite) | data.europa.eu — the EU's own open-data portal — tags every `nrg_ti_gas` distribution `{"id": "CC_BY_4_0", "label": "Creative Commons Attribution 4.0 International", "resource": "http://spdx.org/licenses/CC-BY-4.0"}`. This, not the copyright-notice page, is the citable basis. | — |
| "the general principle is the **CC BY 4.0** international licence" | **MISAPPLIED** | The copyright notice scopes CC BY 4.0 to *editorial content*: *"The copyright for the **editorial content of this website**, which is owned by the EU, is licensed under the Creative Commons Attribution 4.0 International licence."* The grant that actually covers the data is the next paragraph: *"Reuse of statistical data, metadata, publications, and other dissemination tools published on this website for commercial or non-commercial purposes is authorised provided the source is acknowledged. The reuse policy of the European Commission is implemented by the Decision of 12 December 2011."* (https://ec.europa.eu/eurostat/web/main/help/copyright-notice) | Cite Commission Decision 2011/833/EU + the data.europa.eu CC-BY-4.0 tag. Do **not** cite the editorial-content sentence. |
| Quote: *"There is no special procedure or requirement for a written licence. Just download the material and use it, unless the material is listed in the exceptions above."* | **CONFIRMED verbatim / MISAPPLIED in context** | Verbatim. But it sits under the heading *"How to re-use Eurostat material for **commercial** purposes"* — it is the commercial-path instruction, not the general grant the note presents it as. | Quote it with its heading. |
| Quote: *"Reuse of statistical data … authorised provided the source is acknowledged"* + the translations/modifications rider | **CONFIRMED verbatim** | Both exact. Rider: *"When reuse involves translations of publications or modifications to the data or text, this must be stated clearly to the end user of the information. A disclaimer regarding the non-responsibility of Eurostat shall be included."* | — |
| Citation form `Source: [DOI], [access date]` | **CONFIRMED verbatim** | *"Source: [digital object identifier (DOI) number of the Eurostat dataset], [access date]"*, plus a separate form for customised versions: *"Source: [Eurostat dataset datacode link], [access date]"* — **the second one is ours**, since we ship a derived extract. | Use the *customised-version* form, not the DOI form. |
| Third-party data inside energy statistics? | **CONFIRMED — no exception bites** | The notice's only relevant carve-out is *"Data identified as belonging to sources other than Eurostat"*, immediately defused: *"All data published on Eurostat's website can be regarded as belonging to Eurostat for the purpose of their reuse, with the exceptions stated below, or if it is explicitly stated otherwise."* The SDMX dataflow metadata for `ESTAT:NRG_TI_GAS(1.0)` carries **no** dataset-level licence override (fetched; 5,026 bytes, no `licen`/`copyright`/`CC` string). | — |
| Does the grant cover derived files we host? | **CONFIRMED, with a condition the note omits** | Yes — but only if the modification is disclosed. `G3000 − G3200` is a modification, so the rider above is mandatory: state the transformation *and* carry the Eurostat non-responsibility disclaimer on `/methodology` and in the file's catalog entry. | Add the disclaimer requirement to the sizing table. |
| "One ambiguity, currently moot" — non-EU commercial carve-out | **CONFIRMED, and the note under-reads it** | Carve-out verbatim as quoted. The notice then adds a sentence the note omits: *"Examples are data for the United States of America, Japan or China. In such cases, the user will need to eliminate these data from the tables before reusing them commercially."* "Eliminate these data **from the tables**" reads naturally onto partner-dimension rows, so the answer is probably "yes, it reaches partners". Non-commercial today, so still moot — but the note's "genuinely unclear" is closer to "probably bites". | — |
| Bruegel: Q2 verdict *"Bruegel is CC BY-**ND** (cite, never transform)"* | **WRONG**, and contradicts the note's own Q2.1 table ("Yes, per the dataset page") | Both quotes are verbatim, but they govern different objects. The ND policy governs *"Bruegel publications"*; the dataset page's own **Data Policy** governs *"Bruegel datasets"* and grants *"freely use our data in its unchanged form **or after any transformation** for any purpose and can freely distribute it, provided that proper attribution is made"*. There is no conflict to resolve — the Data Policy governs. | Strike the ND verdict line. Keep "confirm in writing": the Data Policy is a bespoke grant with no named licence, version or date. |
| Bruegel dataset "frozen at 2026-07-02 / *will no longer be updated*" | **MISAPPLIED** | The dataset is **live** — *"Latest update: 10 September 2026"*, DOI 10.64153/WVKK8731, still tagged active. Only the **legacy bulk ZIP** is frozen; the page says the Download Data button is *"temporarily"* maintained *"for the legacy dataset (running until 2 July 2026)"*. The phrase *"will no longer be updated"* is not on the page — it is in `README_updates_discontinued_2026_07.txt` **inside** the ZIP. | "A layer built on it would be dead on arrival" → the risk is that live data now comes only from per-graph download buttons with **no stable bulk URL**. Strengthens, not weakens, the archive-to-R2 recommendation. |
| Bruegel `route_data` named columns | **CONFIRMED, one column name WRONG** | ZIP downloaded today (401,438 bytes, 9 files). Header has `Nord Stream_*`, `Ukraine Gas Transit_*`, `"Yamal (BY,PL)_*"` exactly — but TurkStream is `turkstream20 … turkstream26`, lowercase, no min/max. File is **weekly wide-format**, not daily. README flags a 2021 week-number shift and 10.3 vs 11 kWh/m³ for Norway. | Fix the column name and the "Daily" cell in the Q2.1 table. |
| ENTSOG: "its two governing documents contradict each other" | **MISAPPLIED** (bottom line survives, reasoning does not) | All three quoted articles are verbatim, in the TP T&C PDF https://transparency.entsog.eu/pdf/TRA0394_20161115_ENTSOG_TP_Privacy_TC_of_Use_Rev_3.pdf. But TP Art. 2.2 says the TP *"is governed by specific conditions of use contained and laid down in the present Terms and Conditions of Use"*, and the main site's lead paragraph defers: *"For the use of any data published on the ENTSOG Transparency Platform, please refer to the dedicated Privacy Policy and terms of use."* Main-site Art. 4.2 does not reach TP data. The note's "which the TP terms say they *complete*" is a misreading — "completing" is in the **main site's** Art. 2.3. | The correct ground is that the TP T&C contains **no redistribution grant**: Art. 3 reserves all rights, Art. 5.1 permits only *"download, store and use"* + quote with attribution. Display-only / ask-in-writing is still right. The genuine tension is internal: Art. 5.6 (anti-bulk) vs Art. 5.7 (API blessed). The "60-second query cap" is not in the T&C. |
| JODI: *"All such rights are reserved"*; no partner dimension | **CONFIRMED** | Verbatim under "Intellectual Property". The terms page contains no grant language of any kind. JODI Gas schema is product × flow × country × month; no counterparty field. | — |
| IEA quotes; Q2 verdict *"IEA is paid"* | quotes **CONFIRMED verbatim**; verdict **WRONG** | Both the 5-data-point cap and *"You must not share, or enable others to access, any Non-CC Material"* are exact. But IEA Gas Trade Flows is free of charge — the note's own Q2.2 says so. | "IEA is licence-blocked, not price-blocked." |
| EI licence quoted from a third-party mirror (open question #7) | **CONFIRMED on an official EI URL — caveat can be narrowed** | Both sentences are verbatim in https://www.energyinst.org/__data/assets/pdf_file/0007/1658077/Statistical-Review-of-World-Energy.pdf (official, **2025/74th** edition). The 2026 full edition is still email-gated; the official 2026 *summary* has a reworded and **broader** notice — *"For extensive reproduction of **Review data**, permission must be obtained"* — with no S&P clause (it lives in the full edition's back matter). The workbook footer *"Source: Includes data from FGE NexantECA, S&P Global Energy"* is present verbatim in the repo's 2026 file. | Cite the official 2025 URL; narrow open question #7 to "the 2026 full edition's S&P clause". |

#### Q2 — the Eurostat data claims (priority 2)

All queries against `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_ti_gas`, keyless JSON-stat,
`siec=G3000`/`G3200`, `unit=MIO_M3`, on 2026-09-19 (dataset `updated: 2026-06-24T11:00:00+0200`).

| claim | verdict | what the source says | corrected value |
|---|---|---|---|
| DE←RU 2021 = 55,443 MIO_M³ = 55.4 bcm | **CONFIRMED** | `55443.282` | — |
| Germany 2021 in full: Total 84.8 · RU 55.4 · NO 16.2 · NSP 13.2 | **CONFIRMED exactly** | TOTAL `84808.4`, RU `55443.282`, NO `16159.5`, NSP `13205.6`; the three sum to the total to the decimal. Germany reports **no other partner** in 2021. | — |
| TR←RU 2021/22/23 = 26.3 / 21.6 / 21.3 | **CONFIRMED** on G3000 | `26342.61 / 21574.73 / 21340.41` (2024 `21571.78`) | — |
| …but presented as a **pipeline** figure | **MISAPPLIED** | Türkiye imports Russian **LNG** from 2022: G3200 = `0 / 193.41 / 789.67 / 496.75`. On the note's own `G3000 − G3200` rule the pipeline series is **26.34 / 21.38 / 20.55 / 21.08**. The headline table compares G3000 against BACI HS 271121, which is gaseous-state only. | TR←RU pipeline 2023 = **20.55**, not 21.3. Apply `G3000 − G3200` in the headline table too. |
| HU←RU 2023 = 6.41 bcm | **CONFIRMED** | `6413.0` (G3200 = 0) | — |
| IT←RU 2021 = 29.2 vs BACI 28.2 | **CONFIRMED both sides** | Eurostat `29170.696`; BACI RUS→ITA 2021 re-extracted = 20,704,400 t = 28.17 bcm | — |
| SK←RU 2023 = 2.88; 2021 = 3.5 | **CONFIRMED** | `2877.0` / `3536.0` | — |
| `siec` G3000 = Natural gas, G3200 = LNG; pipeline = G3000 − G3200 | **CONFIRMED** | Labels exactly as claimed. Identity check reproduced exactly: ES 2024 DZ G3000 `11669.922` − G3200 `2251.352` = `9418.570`; ES←US G3000 = G3200 = `5060.908`, difference 0. | — |
| `unit` ∈ {MIO_M3, TJ_GCV}; annual **1990–2024**; monthly **2008-01 → 2026-08** | **CONFIRMED** | 35 annual periods 1990…2024. `nrg_ti_gasm` returns 224 periods, 2008-01…2026-08. | — |
| "44 reporters … **plus** EU-27 and euro-area aggregates" | **WRONG (minor)** | `geo` has exactly 44 entries and the aggregates are **inside** it: EU27_2020, EA20, EA21. So **41 reporters + 3 aggregates**. All named countries confirmed present: TR, UA, MD, RS, BA, MK, GE, NO, and GB **as `UK`**. | 41 reporters. |
| "166 partners" | **CONFIRMED** | 167 `partner` codes including `TOTAL` ⇒ 166 partners. | — |
| Dataset label *"Imports of natural gas by partner country - monthly data"* for `nrg_ti_gas` | **WRONG (minor)** | `nrg_ti_gas` label is *"Imports of natural gas by partner country"*. The "- monthly data" label belongs to `nrg_ti_gasm`. | — |
| **Trap: confidential `:c` cells** | **CONFIRMED CLEAN — does not bite** | Full `siec=G3000, unit=MIO_M3, time=2021+2023` slice pulled for all geo × partner: **13,912 values, 0 status flags**, empty `status` object. No `:c`, no `:u`. Suppression here takes the form of a `NSP` bucket or an aggregate partner, never a flag. | — |
| **Trap: partner = "not specified"** | **CONFIRMED and much worse than the note says** | NSP is not a residual for these reporters, it is the whole record. **Austria 2021 and 2023 report 100% NSP** (TOTAL 4,754.7 and 7,117.6, no country partners at all). Slovakia carries NSP 1,595 (2021) / 1,624 (2023) against a 4.5–5.1 total. | See the three broken Q3 rows below. |
| **Trap: aggregate partners** | **NEW — not mentioned in the note** | The `partner` dimension contains continent buckets (`EUR_OTH`, `ASI_NME_OTH`, `AFR_OTH`, `AME_OTH`, `EX_SU_OTH`, `ASI_OTH`) that reporters use instead of countries. **Poland 2023** is reported almost entirely this way: EUR_OTH 7,287.4, NSP 3,760.3, ASI_NME_OTH 2,591.6, of a 15,887.2 total. Summing partner rows without excluding these double-counts against TOTAL. | An ingest must whitelist ISO-2 partner codes and route the rest to an "unattributed" bucket. |
| **Trap: Germany's suppression of partner detail** | **CONFIRMED** | 2021: only RU, NO, NSP — the Netherlands, historically one of Germany's largest suppliers, is absent. 2023 is the opposite shape (see below). | — |
| **"Eurostat … reports net imports"** (§Q3.3 caveat, line 494) | **WRONG as a general statement** | There is a separate exports table, `nrg_te_gas` *"Exports of natural gas by partner country"*. Germany reports **0.0** exports in 2021 and 2023 and an import figure that plainly excludes transit (84.8 bcm vs BNetzA's 1,652 TWh ≈ 156 bcm). But the Netherlands reports imports 30.9 / exports 16.7 (2021) and Belgium 21.3 / 2.8 — gross on both sides. **The import concept is reporter-specific, so `totalQty` denominators are not on a common basis across reporters.** | Say "Germany's series excludes transit; other reporters' do not". |
| **"Eurostat … gets right exactly what BACI gets wrong"** / NSP is *"precisely the hub problem BACI silently mislabels as a Belgian export"* | **WRONG for the years that matter** | Germany 2023, pipeline basis: TOTAL 65.1 · NO 29.6 · **NL 17.65** · **BE 14.92** · NSP 3.0 · RU 0.0. Belgium and the Netherlands produce nowhere near 32 bcm of exportable gas between them — these are regasified LNG and Norwegian gas re-declared at the German border, i.e. **exactly the origin-laundering the note documents in BACI** (BACI BEL→DEU 2023 = 20.1 bcm; Eurostat 14.9 bcm — the same phenomenon, the same order of magnitude). DE←BE and DE←NL were both `0.0` in 2019, so this is a post-2022 re-sourcing artefact, not a long-standing convention. France, Belgium and the Netherlands all appear in each other's partner lists in both directions. | **Eurostat has the same hub problem as BACI.** It is smaller and partly honest (NSP), not absent. The note must say so; the go/no-go currently rests on the opposite claim. |
| "Eurostat `geo=PL, partner=NO` gives [Baltic Pipe]" (§Q3.7) | **WRONG** | `PL←NO` G3000 = **0.0** in 2022, 2023 **and** 2024. Poland does not attribute Baltic Pipe volumes to Norway in this dataset. | Baltic Pipe remains UNSOURCED. Remove the Eurostat fix. |
| Eurostat DE←NO 2021 = 16.2 vs Gassco 55.6 | **CONFIRMED** | `16159.5` | — |

#### Q1 — BACI HS 271121 (priority 3)

Re-extracted independently from the pinned `BACI_HS92_V202601` zip using `_YEAR_ENTRIES` / `_fetch_year_csv` /
`filter_products` and the repo's own `country_codes_V202601.csv`. Per-year row counts reproduced **identically** to
the note's Q1.1 table (495/329/340/342/341/368/386/385/423/345).

| claim | verdict | what the source says | corrected value |
|---|---|---|---|
| RUS→DEU zero rows in **every** year 2015–2024 | **CONFIRMED** | Checked all ten years, not just the two required. Zero rows, not null-`q`. Germany 2021 = NOR 55.34, BEL 1.88, ITA 0.42, CZE 0.02, IRL 0.02, HUN 0.01, + trace; total 57.7 bcm; no RUS row, no NLD row. | — |
| BEL→FRA 2023 = 24,486,030 t / 33.3 bcm / 18.74 bn USD / 765 USD/t | **CONFIRMED to the tonne** | `q = 24,486,029.6`, `v = 18,737,657.544` k USD, 33.31 bcm, 765 USD/t | — |
| RUS→TUR zero rows 2022 | **CONFIRMED** (and all ten years) | Türkiye 2022 = AZE 6.807 bcm + KAZ 0.011 bcm only | — |
| NOR→DEU 2023 = 39,550,070 t / 24.43 bn / 618 USD/t | **CONFIRMED exactly** | `39,550,070 t`, `24,433,077.57` k USD | — |
| Russia is present as an exporter (so this is a missing-*counterparty* defect) | **CONFIRMED** | RUS 2021: 23 rows, 56,388,020 t = 76.72 bcm (reproduces the note's 76.7), 27.74 bn USD. Top 5: ITA 28.17, SVK 9.15, CZE 8.63, HUN 5.87, CHN 5.35 bcm. | — |
| EI `Gas - Trade movements` rows 42–43: Russia pipeline exports / of which Europe | **CONFIRMED** | 2019 220.7/191.3 · 2020 197.4/167.4 · 2021 201.3/167.7 · 2022 125.0/85.6 · 2023 91.0/45.7 · 2024 111.3/51.6 — every figure in the note's two ratio tables reproduces. | — |
| EI row 77 China pipeline imports of which Russia: 7.6 / 14.6 / 21.5 / 29.5 / 36.7 | **CONFIRMED** | 7.584 / 14.575 / 21.512 / 29.452 / 36.721 | — |
| EI row 78 Other CIS→China: 41.7 / 40.5 / 37.9 / 38.3 / 36.7 | **CONFIRMED** | 41.747 / 40.521 / 37.872 / 38.255 / 36.668 | — |
| EI `Gas Prices ` row 45 2023: TTF 12.87, Henry Hub 2.53, "5.1× spread" | **CONFIRMED** | `12.865138` / `2.528480`; ratio **5.088** | — |
| EI `Gas trade 2025 - pipeline` has **378 rows** | **WRONG (minor)** | The sheet is **36 rows × 23 columns**. Everything else about it is exact: EU is one row; importer rows are Canada/Mexico/US/Argentina/Brazil/Other S.&C.America/EU/Non-EU Europe/Belarus/Kazakhstan/Russian Federation/Other CIS/UAE/Other Middle East/South Africa/Other Africa/Australia/China/Malaysia/Singapore/Thailand plus region subtotals; footnote verbatim *"*intra-region trade is excluded. For example, trade between countries within other europe is excluded."* | 36 rows. |

**Q1 verdict stands, unqualified.** Nothing in it needs correcting.

#### Q3 + Addendum (priority 4)

Every URL in Q3.0–Q3.9 and the Addendum was re-opened. Nothing is dead; four URLs bot-block `curl` and were
verified via Tavily or an authorised republication ([T1] CSD, [T2] Reuters, [N2] congress.gov, [T3] S&P).
Capacity-vs-throughput and bookings-vs-flows discipline is **clean throughout** — [T5] is labelled "contracted, not
flowed", the Yamal booking link is labelled "booked capacity, not flow", [N7] refuses to annualise a daily rate,
and every nameplate (35/33.5 TransMed, 8 GreenStream, 11.5/13.5 GME, 8→10.7 Medgaz, 38 PoS, 55 CAGP, 33 Yamal) is
presented as capacity. This is the note's strongest quality.

Only the rows that are **not** plain CONFIRMED are listed.

| claim | verdict | what the source says | corrected value |
|---|---|---|---|
| Q3.1 "the whole **2019–2024** contract"; "1.7 bcm over **six years**" | **WRONG** (twice) | [U1], [U2] and [U3] are unanimous: the agreement was signed in 2019 and covered **2020–2024** — 65 bcm in 2020, then 40 bcm/y 2021–24. | **2020–2024**; **five years**. |
| Q3.1 `RUS \| HUN \| 2023 \| ~0.08` derived as "6 bcm total [T2] − >5.5 bcm via TurkStream [T3]" | **MISAPPLIED — the most serious Q3 error** | [T3] says *"total Russian gas exports to Hungary in 2023 exceeding 5.5 Bcm"* — an **all-routes total**, which is how the note itself uses the same source in Q3.2. Using it as a TurkStream volume makes numerator and denominator the same quantity. | Derive from [T4]: 6.0 − 5.6 = 0.4 bcm ⇒ **~0.07**. Source the 6 bcm total to CSD/per Concordiam (4.5 bcm contract + *"at least another 1.5 bcm"*), not to the single ambiguous Reuters clause. |
| Q3.1 `RUS \| ITA \| 2023 \| 1.00` (CGEP 3–4 bcm via Ukraine, Eurostat IT←RU 2.93) | **MISAPPLIED** | The route figure **exceeds** the destination total, so the implied share is >1.0 — the same non-divisibility the note diagnoses for Germany in Q3.3 and Slovakia in Q3.0, unflagged here. And CGEP's 3–4 bcm is the **Jul 2022–Jun 2023 rolling window**, entered as a 2023 value against the note's own explicit instruction in [U6]. | Mark the basis mismatch. Eurostat pipeline basis gives IT←RU 2023 = **2.84 bcm = 6.3%** of Italy's pipeline imports. |
| Q3.1 `RUS \| AUT \| 2023 \| 1.00` | **WRONG on the recommended dataset** | **Eurostat AT←RU = 0.0 in both 2021 and 2023** — Austria reports 100% `NSP`. The row's evidence (CGEP ~5 bcm, Rystad 5.7 bcm) is also the rolling window, and 5/5.7 = 0.88, not 1.00. | Austria is **unrepresentable** on the destination basis. Drop the row or carry it as UNSOURCED. |
| Q3.1 `RUS \| MDA \| 2023 \| 1.00` at 1.9 bcm | **MISAPPLIED (basis)** | **Eurostat MD←RU 2023 = 0.0707 bcm**, 11.3% of Moldova's 0.63 bcm pipeline imports. The 1.9–2.2 bcm figures are entry-point volumes, most of which went to Transnistria, not to declared Moldovan imports. | On the destination basis Moldova is ~0.07 bcm, not 1.9. A 27× gap. |
| Q3.1 `RUS \| SVK \| 2023 \| 1.00` | **CONFIRMED but under-caveated** | Sound on route-exclusivity, but its evidence (12.67 / 13.5 bcm) is entry-point while the schema is destination-family (2.88 bcm). Q3.0's own warning applies and isn't restated. | Restate the Q3.0 caveat on this row. |
| Q3.2 `RUS \| MKD \| 2023 \| 1.00` | **UNSOURCED** (note claims sourced) | [T1] establishes only that *"less than 3% of the gas is delivered to North Macedonia"*. It nowhere says North Macedonia's Russian gas is 100% TurkStream. (Eurostat MK←RU 2023 = 0.356 bcm = 100% of MK's pipeline imports — consistent, but that is a *supplier* share, not a *route* share.) | Mark UNSOURCED. |
| Q3.2 `RUS \| GRC \| 2023 \| 1.00` | **MISAPPLIED** | The volume is sourced; the 1.00 rests on an uncited claim that Trans-Balkan had reversed. [T1] in fact records Gazprom holding Trans-Balkan capacity bookings **until 2030**, which cuts the other way. Separately, Greece imports Russian **LNG**: Eurostat EL←RU 2023 G3000 2,111 − G3200 777 = **1.33 bcm by pipe**, against [T1]'s 2.7 bcm — a 2× gap on the same year. | Mark the 1.00 UNSOURCED and reconcile 2.7 vs 1.33 before using either. |
| Q3.2 [T5] Enerdata 6/22 = 0.27 | **CONFIRMED, date missing** | The article is dated **5 December 2025** and describes contracts extended into 2026; the note applies it to a 2022/2023 row with no date. | Date the source; label it a 2025 contractual snapshot. |
| Q3.3 [N3] Brookings "two-thirds of Germany's total imports in 2021" | quote **CONFIRMED**, source figure **WRONG** | ⅔ × 1,652 TWh ≈ 104 bcm against NS1's actual 59.2 bcm. The true figure is 59.2 ÷ (1,652/10.55) = **37.8%**. The note flags it as "in tension"; it is arithmetically falsified by [N1] + [N5]. | Sharpen the flag. The note's decision not to adopt it was right. |
| Q3.3 the 0.73 estimate and its caveat | **CONFIRMED, arithmetic exact** | 1,652 × 0.52 = 859.04 TWh ⇒ 81.43 bcm; 59.2/81.43 = **0.727**; 59.2/55.4 = **1.069 > 1**, so the note's "using Eurostat as the denominator would give a share above 1.0" is exactly right. | — |
| Q3.4 "the pipeline itself stopped on 12 May 2022 **on the EuRoPol GAZ sanctions**" | **WRONG (attribution of the date)** | No source conflict exists: the sanctions decree took effect **11 May** ([Y2]); Gazprom's announcement that it would stop using the Polish section came **12 May** ([Y1]). Both the table row and the prose attach 12 May to the sanctions. | "Sanctions on EuRoPol GAZ imposed 11 May 2022 [Y2]; Gazprom announced it would no longer use the Polish section on 12 May [Y1]." |
| Q3.1 [U5] Bruegel Table 1 reproduced without its footnote | **MISAPPLIED (omission)** | Table verbatim (409/193/140/112; 1,080/472/140/115; 3,856/3,751/3,250/2,072; 11/5/4/5%) and both derived shares recompute (27.5%, 50.0%). But Bruegel's note reads *"* = first eight months of year"* — **the 2024 column is Jan–Aug only**. | Carry the footnote; do not use the 2024 column as a full year. |
| Q3.1 [U1] "Poland 8.5 bcm (5.5%)" | **WRONG (source's own error, faithfully copied)** | 8.5/148 = **5.74%**. The other four reconcile (73.4 / 11.15 / 8.51 / 1.15). | *sic* it. |
| Q3.5 [A2] 11.5 bcm/y GME vs [A4] 13.5 bcm/y GME | **WRONG — an unreconciled conflict** | Both quotes verbatim; the conflict is real and the note never notices it. Both are capacity, neither is throughput. | State GME as **~12 bcm/y (sources give 11.5–13.5)**. |
| Q3.5 [A2] and [A11] cited as two sources | **MISAPPLIED (minor)** | Identical URL, cited twice under two ids. It is a 2021 article used to support a 2023 row (independently true per [A3], but the citation doesn't reach 2023 alone). | Merge the ids. |
| Q3.5 GreenStream *"far below its 8–11 bcm capacity"* | **UNSOURCED (the 11)** | [A7] sources the 8 bcm/y. Nothing in range sources 11. | Drop the 11 or cite it. |
| Q3.5 [A7] MEES used for a 2022/2023 row | **CONFIRMED, date caveat** | Quote verbatim, but the article is about **2025** (Libya's 22-year low), dated 2026-01-16. Fine for the structural "single-route, single-destination" claim; say so. | — |
| Q3.8 "Power of Siberia 2 is `proposed` in GEM (P5409, P0734)" and the whole Q3.10 id table | **CONFIRMED** | Every one of 21 spot-checked pids re-read from `data/raw/gem_gas_infra/ggit_map_2026-02-20.geojson`: statuses, names and endpoints match the note exactly, including P0753 `mothballed` `stopyear 2022`, P0769 `idle`, P0806 `cancelled`, and the note's flag that GEM gives Europipe I (P0689) `startcountryorarea = United Kingdom`. | — |
| Q3.9 [C1] "China total pipeline imports, 2023 ~66.07 bcm" | **MISAPPLIED** | Quote verbatim, but the source says *"estimated to be around"* — an S&P **forecast published 22 Dec 2023**. The outturn per IEEFA is **69.2 bcm**. Also 34.09/64.8 (IEEFA's 2022 actual) = **0.526**, not the 0.54 the source prints. | Label 66.07 a forecast. |
| **Addendum** Enagás Medgaz/MEG 2021 split 0.574/0.426 | **CONFIRMED — the strongest row in the note** | Boletín dic-2021 §2.1 *Conexiones Internacionales*, Saldos Netos, **unit GWh**, Ene–Dic 2021: Almería **88,688**, Tarifa **65,877**, sum **154,565**; 0.57379 / 0.42621. Contamination check passed: the same PDF's *Origen de suministros* lists *"Argelia GN 154.565 GWh"* and *"Argelia GNL 23.425"* as **separate** rows, so Almería + Tarifa is Algerian **pipeline** gas exactly — no LNG at either point. Tarifa is 0 in December (MEG closed 1 Nov). Triple-sourced: Sedigas "Argelia GN 2021 = 154,6 TWh"; S&P independently "Medgaz just under 8 Bcm, GME just under 6 Bcm" in 2021. | — |
| **Addendum** "Norway→Germany 2022 is 55.6, **not 54.8** — Gassco restated it … (Reuters, 10 Jan 2024)" | **WRONG — the restatement narrative is fabricated** | The Reuters story of that date says: *"Deliveries to Germany rose in 2023 to an all-time high of 56.2 billion m3 **from 55.6 billion m3 a year earlier**, helped by a new connection to Denmark."* 55.6 **is** the as-reported 2022 figure; **"54.8" appears in no source**. Gassco's own note has the Denmark offtake opening autumn 2021, so 2022 already included it. | Delete the restatement story. 55.6 stands as originally published; the 2023 *rise* to 56.2 is what Denmark explains. **The four 2022 shares are unaffected and exact**: 55.6+27.9+17.8+15.6 = 116.9 precisely ⇒ 0.4756 / 0.2387 / 0.1523 / 0.1334, sum 1.000. 2023 also closes exactly: 56.2+24.1+13.8+15.0 = 109.1. |
| **Addendum** Terna Fig. 44 shares 0.41 / 0.51 TransMed, 0.05 / **0.07** GreenStream | **3 of 4 CONFIRMED, 1 WRONG** | Fig. 44 = *"Approvvigionamento gas italiano 2019–2023 [Gm3/anno]"*, entry-point **throughput** (Mazara del Vallo = TransMed, Gela = GreenStream, Tarvisio, Passo Gries, Melendugno, GNL, national production) — correctly not capacity. 2023 pins exactly against §8.6 prose (pipeline 45.0 Gm³): 23+2.6+2.8+6.6+10 = 45.0. TransMed 24/58.1 = **0.413**; 23/45.0 = **0.511**. GreenStream 3/58.1 = **0.052**; 2.6/45.0 = **0.058**. | GreenStream 2023 = **0.06**, not 0.07. Also note the "share of pipeline imports" is the researcher's derivation, not Terna's. |
| **Addendum** "TransMed and GreenStream pair shares of 1.00 confirmed by enumeration of entry points (Adriatic LNG, *Dati Operativi 2023*)" | **MISAPPLIED** | An LNG terminal's own operating-data release cannot enumerate Italy's **pipeline** entry points. The enumeration that actually supports the 1.00 shares is Terna Fig. 44. | Drop the Adriatic LNG citation; cite Terna. |
| **Addendum** "TKM→CHN 2022 = 35 of 64.8 = 0.54 (**Lowy Institute, 13 Dec 2023**)" | **WRONG — misattributed** | The Lowy article ("Power of Siberia 2: Moving beyond a pipe dream?") is dated **6 October 2023** and contains **no 35 bcm, no 64.8, and no Turkmen volume at all**. | The 35 bcm is Reuters 24 May 2023 / GEM; the 64.8 is IEEFA. Re-cite both; drop Lowy. |
| **Addendum** "Al-Attiyah Foundation 32.9 bcm" as a TKM→CHN 2023 estimate | **MISAPPLIED** | Actual text: *"non-Russian pipeline gas, **primarily sourced from Turkmenistan**, has been relatively stable at 32.9 BCM/year"* — i.e. TKM + KAZ + UZB + Myanmar, with no single year pinned. Net of KAZ 5.857 it bounds TKM at ~27. | It is an **upper bound**, not an estimate. (The Addendum's *conclusion* — TKM 2023 is UNSOURCED — remains correct.) |
| **Addendum** PoS share range **0.325–0.34** | **CONFIRMED, with a denominator caveat** | IEEFA verbatim: *"from 64.8 bcm in 2022 to 69.2 bcm … imports from Russia increased to 22.5 bcm"*. 22.5/69.2 = **0.3251**; CGEP's *"34 percent"* is verbatim and 0.34 × 66.07 = 22.46, self-consistent. But the two endpoints use **different denominators** (IEEFA 69.2 outturn vs S&P 66.07 forecast); on one denominator the spread is only 0.325–0.328. | Say which denominator each endpoint uses. |
| **Addendum** KAZ→CHN 2023 = 5.857 bcm (Astana Times) | **CONFIRMED** | Verbatim; 5.07 × 1.155 = 5.856 | — |
| Q3.8 22.7 (CGEP/OSW) vs 21.5 (EI) vs 22.5 (IEEFA) | **CONFIRMED** | All three verbatim in their sources. The note's "pick one and state it" is the right call. | — |

#### Prerequisites (priority 5)

| claim | verdict | what the repo says |
|---|---|---|
| `disruption_route` has **no `year` column** | **CONFIRMED** | `public/data/disruption_route.parquet`, 525 rows, schema exactly: `disruption_id, kind, exporter_iso3, importer_iso3, share, source, source_title, source_url, source_year, source_note`. |
| Nord Stream / NS2 / Yamal–Europe / Soyuz absent from the shipped sidecar | **CONFIRMED** | `public/data/pipelines.geojson`: 3,957 features, 3,957 unique ids; **P0753, P0752, P0769, P0761, P0806 all absent**; P0768, P0765, P2055, P0453 present. |
| …but present in `data/raw/gem_pipeline_routes/` | **CONFIRMED** | `data/raw/gem_pipeline_routes/gas-pipelines/{P0752,P0753,P0761,P0769,P0806}.geojson` all exist. |
| Cause is `STATUS_MAP` | **CONFIRMED** | `scripts/transform/build_pipelines.py:69` — `STATUS_MAP = {"operating": "operating", "construction": "in-construction"}`, applied at line 130. |
| Engine is destination-family: exposure = Σ (importer's imports from exporter × share) ÷ importer's total | **CONFIRMED** | `src/lib/scenarios/engine.ts:112–132` — `shareAtRisk = totalQty > 0 ? atRiskQty / totalQty : 0`, `totalQty` keyed by importer. |

### Entry-point vs destination: one basis, and what it costs

**Recommendation: destination.** It is the only basis the engine can express without a rewrite — `totalQty` is the
importer's own declared total, so a numerator on an entry-point basis produces shares above 1.0, which the note
already demonstrates twice (Nord Stream ÷ Eurostat DE, and Italy 2023 in Q3.1). Mixing bases silently is the exact
failure this note was written to prevent.

But the note's open question #1 mis-states what destination costs. It says the destination basis "makes a 'cut
Ukraine transit' scenario rank **Austria (5.7 bcm)** above Slovakia (3.2 bcm)". On the recommended dataset it does
no such thing:

| importer | Eurostat 2023 ←RU, pipeline (bcm) | total pipeline imports (bcm) | supplier share | what the transit headlines say |
|---|---:|---:|---:|---|
| Slovakia | **2.88** | 4.50 | 63.9% | 12.67 bcm entered; 4.3 bcm consumed |
| Italy | **2.84** | 45.26 | 6.3% | 3–4 bcm via Ukraine (rolling window) |
| Hungary | 6.41 (mostly TurkStream) | 8.21 | 78.1% | ~0.4 bcm via Ukraine |
| Czechia | 0.55 | 6.81 | 8.1% | — |
| **Austria** | **0.00** | 7.12 | **0.0%** | ~5 bcm via Ukraine — the single most transit-dependent EU state |
| **Moldova** | **0.07** | 0.63 | 11.3% | ~2.0 bcm |

So the honest destination-basis Ukraine-transit scenario for 2023 is **Slovakia and Italy, roughly equal in
absolute volume and 10× apart in supplier share, with Austria and Moldova showing zero or near-zero exposure
because their own statistical offices do not attribute origin.** That is defensible and it is *interesting* — the
Slovakia/Italy contrast is exactly the kind of structural point the site exists to make — but it is not the story
a reader arriving from the transit headlines expects, and Austria's absence will read as a bug unless the panel
says why. Open question #1 should be re-asked with these numbers, and `/methodology` must carry an explicit
"reporters that do not attribute origin" note naming Austria and Poland.

### Go / no-go for a first European pipeline-gas scenario

**Conditional GO — narrower than the note's, and not on the note's stated grounds.**

The licence clears (better evidence than the note cites), the data clears where reporters attribute origin, Q1 is
watertight, and the three prerequisites are exactly as described. What does **not** clear is the claim that
Eurostat escapes BACI's hub defect — it does not — and the note's go/no-go rests on that claim. Ship anyway, but
only for pairs where the exporter is a *producer* and the importer attributes it. Concretely:

**Rows I would stand behind today**, `scenario = ukraine_transit`, year-aware, destination basis, Eurostat
`G3000 − G3200` as the trade matrix:

| exporter | importer | year | share | basis |
|---|---|---|---|---|
| RUS | SVK | 2021 | 1.00 | no non-Ukrainian Russian route to Slovakia before 2025 [U1]; Eurostat SK←RU 3.54 bcm |
| RUS | SVK | 2023 | 1.00 | as above; Eurostat 2.88 bcm = 63.9% of Slovak pipeline imports |
| RUS | CZE | 2021 | 1.00 | Waidhaus is fed from the Slovak entry; Eurostat CZ←RU 8.72 bcm = 100% of Czech pipeline imports |
| RUS | HUN | 2023 | 0.07 | [T4] 6.0 − 5.6 = 0.4 bcm ÷ Eurostat 6.41 — **corrected from the note's 0.08**, and still low confidence |
| RUS | ITA | 2023 | UNSOURCED | route volume exceeds the destination total; needs a within-year corridor split |
| RUS | AUT | any | **omit** | Eurostat AT←RU = 0; Austria reports 100% "not specified" |
| RUS | MDA | any | **omit** | Eurostat MD←RU 2023 = 0.07 bcm; the 1.9–2.2 bcm figures are entry-point/Transnistria |
| RUS | POL | any | **omit** | Poland 2023 reports only continent aggregates; no Norway, no Russia |

Plus, as separate scenarios once the year column lands, the two rows that are **fully verified and clean**:
**DZA→ESP Medgaz 0.574 / MEG 0.426 for 2021 and 1.00 / 0.00 for 2023** (Enagás primary, triple-corroborated), and
**NOR→{DEU+DNK, GBR, FRA, BEL} 2022 = 0.476 / 0.239 / 0.152 / 0.133** (Gassco, sums exact — with the restatement
story deleted).

**NO-GO, unchanged and reinforced:** Power of Siberia, Central Asia–China, Canada→US. Two of the three Addendum
citations for the Turkmenistan figures are misattributed, which is independent evidence that this material is not
ready.

**Four things to fix in the note before it drives a feature**, in order:

1. Retract *"Eurostat … gets right exactly what BACI gets wrong"* and the NSP-vs-hub sentence. Eurostat's
   Germany-2023 matrix is 50% Belgian and Dutch re-exports. The defect is smaller and partly honest, not absent.
2. Delete the Gassco "54.8 → 55.6 restatement" and the Lowy and Al-Attiyah attributions. These are the three
   places the note asserts provenance a source does not carry.
3. Fix `RUS|HUN|2023` (the [T3] double-count), `RUS|AUT|2023` and `RUS|MDA|2023` (unrepresentable on the
   recommended dataset), and the PL←NO "Eurostat gives it" claim.
4. Apply `G3000 − G3200` in the headline Q2.0 table, and add partner-code whitelisting (NSP + continent
   aggregates) to the ingest sizing.

**Verdict count: 59 CONFIRMED · 11 WRONG · 13 MISAPPLIED · 1 UNSOURCED-but-claimed-sourced · 1 UNVERIFIED
(low-risk: [Y3] OIES Insight 70, a capacity restatement carrying no share).** No claim in the note was
UNVERIFIABLE — every source was reachable.
