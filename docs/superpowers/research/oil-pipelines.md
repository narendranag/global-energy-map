# Research: additional oil-pipeline disruption scenarios (R2)

Status: research only. No code, catalog, or transform changes made. Written for the
maintainer to decide which candidates to implement in
`scripts/transform/build_disruption_routing.py` / `src/lib/scenarios/registry.ts`.

Method: Tavily `search` (advanced, ≤8 results) + `extract` for primary-source pages,
cross-checked against `public/data/trade_flow.parquet` (BACI, HS 2709, tonnes/yr;
1 t ≈ 7.33 bbl) via `uv run python` + duckdb, and against `public/data/pipelines.geojson`
for route geometry. ~20 Tavily calls used (well under the ~60 budget). Every share below
either carries a quote from a fetched page or is marked `UNSOURCED` per the existing
convention in `build_disruption_routing.py`.

## Summary

- Four requested corridors researched (ESPO, Kirkuk–Ceyhan, Saudi East-West/Petroline,
  Canada→USA) plus three additional candidates (Kazakhstan–China, Sudan/South Sudan, TAL).
- **Ship now, high confidence:** Keystone and Enbridge Mainline (Canada→USA) — clean
  primary-source throughput table (CAPP/CER), clean BACI denominator, single unambiguous
  `pipeline_id` for Keystone.
- **Ship with caveats, medium confidence:** Saudi East-West/Petroline (reuses the
  `ARGUS_YANBU` citation already in the codebase, just inverted) and Kirkuk–Ceyhan
  (clean pipeline_id, clean capacity figure, but the exporter is Iraq as a whole and BACI
  cannot see Ceyhan as a transit port — see below).
- **Needs more work before shipping, low-medium confidence:** ESPO. The pipeline and the
  Kozmino tanker terminal are structurally one corridor, but BACI's RUS→CHN growth since
  2022 mixes true ESPO/Kozmino-Pacific volumes with Western-Russia (Urals, Baltic/Black
  Sea) crude that now also lands in China by long-haul tanker — the two are not
  separable in bilateral trade data. RUS→JPN and RUS→KOR, historically real Kozmino
  destinations, have collapsed to near-zero in BACI since 2022 sanctions, which is itself
  a citable finding but complicates a clean share table.
- **Real schema gap surfaced by this research:** `DisruptionRouteRow` has no year field —
  every share is a single constant applied across 1990–2024 (same as Druzhba/BTC/CPC
  today). Kirkuk–Ceyhan is the first candidate where "on/off" genuinely varies within the
  visualizable window (shut 2023-03 → 2025-09), so it is the natural forcing case for
  adding year-bounded shares, if the maintainer wants to do that.
- TAL (Trans Alpine) is structurally an **importer-side** chokepoint (many origin
  countries land crude at Trieste and it moves overland to Germany/Austria/Czechia) —
  it doesn't fit the exporter-centric `(exporter_iso3, importer_iso3, share)` schema at
  all. It is the second real case (after the already-deferred "inbound Hormuz exposure")
  needing an importer-wide route concept.

## Modelling notes (read before the tables)

- Every share below is `at-risk fraction of exporter→importer BACI HS 2709 tonnes`, same
  semantics as the existing rows.
- Where BACI's bilateral pair does not correspond to the physical route (Kirkuk–Ceyhan:
  Turkey is a transit/loading point, not the crude's final buyer; ESPO: Kozmino cargoes
  are sold FOB to whichever buyer bids, not fixed to China), the share is set on the
  **exporter-wide wildcard** (`importer_iso3 = null`), same pattern as Hormuz/CPC/BTC, not
  on the specific pair — this is noted per row.
- "Confidence" below follows the existing file's implicit grading: **HIGH** = the source
  states the share/fraction of exports directly; **MEDIUM** = derived from two consistent
  primary numbers (capacity vs. BACI denominator, or two independent quotes that agree);
  **LOW** = single fragmentary quote, inconsistent sources, or a derivation with an
  unverified assumption. Nothing here is invented; where I could not support a number at
  all it is marked `UNSOURCED` (never shipped as a share > 0 without that label, per
  existing convention).

---

## 1. ESPO (Eastern Siberia–Pacific Ocean): Russia → China + Kozmino → Asia

**UI description (draft):** "Russia's Pacific oil corridor: the ESPO trunk line from
Taishet to Kozmino, its overland spur across the border to Daqing, and Kozmino port
tanker loadings that mostly reach China since 2022. Cutting it removes Russia's entire
eastern outlet — Europe's western routes (Druzhba, Baltic/Black Sea ports) are separate
and unaffected."

**routeName:** "the ESPO pipeline and Kozmino terminal"

What "cut ESPO" removes, precisely: (a) the Skovorodino–Mohe overland spur delivering
directly into Daqing, China (bypasses any port); (b) all tanker loadings at Kozmino,
which since the 2022 sanctions on Russian crude go overwhelmingly to China (Japan and
South Korea, historically real Kozmino buyers, have stopped importing Russian crude
almost entirely — see BACI check below). It does **not** affect Russian crude reaching
China or India by long-haul tanker from Western Russian ports (Novorossiysk, Primorsk,
Ust-Luga) around Africa — that is a separate, much larger and faster-growing flow.

**BACI check** (`hs_code='2709'`):

| Pair | 2021 | 2022 | 2023 | 2024 |
|---|---|---|---|---|
| RUS→CHN (t) | 72.11M | 86.25M | 99.55M | 108.47M |
| RUS→JPN (t) | 4.47M | 1.92M | 0.092M | (no row) |
| RUS→KOR (t) | 10.22M | 3.15M | (no row) | (no row) |
| RUS→IND (t) | 2.43M | 37.02M | 88.92M | 92.01M |

RUS→CHN 2024 = 108.47 Mt/yr ≈ 2.18 mb/d (108,469,240 × 7.33 / 365 / 1000). RUS→IND's
explosion (2.4Mt→92Mt, 2021→2024) is almost entirely Urals crude via the Baltic/Black
Sea and long-haul tankers, **not** ESPO/Kozmino — a useful sanity bound: it shows how
large the non-Pacific Russian crude reallocation has been, which is the confound for any
ESPO share derived by assuming "all growth in RUS→CHN is ESPO."

**Share table:**

| Exporter | Importer | Share | Years valid | Source title | URL | Year | Quote | Derivation | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| RUS | CHN | 0.85 (recommend NOT shipping above LOW-MEDIUM confidence — see note) | 1990–2024 (static) | Reuters/gwaramedia, "Russia loses at least 40% oil export capacity, Reuters says" | https://gwaramedia.com/en/russia-loses-at-least-40-oil-export-capacity-reuters-says | 2024/2025 (undated on page) | "Russia continues to supply oil to China via pipelines and through Kozmino port. Combined, these routes account for approximately 1.9 million [b/d]" (quote truncated by the search snippet; full sentence not independently re-verified against the original Reuters wire) | 1.9 mb/d (combined pipeline+Kozmino, Reuters-sourced) ÷ 2.18 mb/d (BACI RUS→CHN 2024) ≈ 0.87, rounded down to 0.85 for the quote-fragment uncertainty | LOW-MEDIUM — single secondary aggregator, quote is a snippet not the full sentence, and it isn't clear the 1.9 mb/d figure is China-specific vs. all-Asia |
| RUS | CHN (spur only, if split from Kozmino) | ~0.30 | 1990–2024 | Erica Downs (USCC testimony), "U.S.-China Economic and Security Review Commission" | https://www.uscc.gov/sites/default/files/Downs_Testimony... | 2019 | "It has a capacity of 1.2 million barrels per day of which around 630,000 bpd go to Kozmino" (implying ~570 kb/d to the Daqing spur) | 570-630 kb/d spur design capacity ÷ 2.0-2.18 mb/d BACI RUS→CHN ≈ 0.28-0.32 | MEDIUM — capacity-based (design, not metered flow), and the 2019 testimony predates the post-2022 sanctions reshuffle |
| RUS | JPN | 0 (structural: BACI shows imports collapsed) | 2022 onward | BACI, `trade_flow.parquet` | n/a | 2024 | RUS→JPN falls from 4.47 Mt (2021) to 0.09 Mt (2023) to no row (2024) | Direct BACI observation, no external citation needed | HIGH (as a BACI-observed fact; not a "share of a route" claim) |
| RUS | KOR | 0 (structural: BACI shows imports collapsed) | 2022 onward | BACI, `trade_flow.parquet` | n/a | 2024 | RUS→KOR falls from 10.22 Mt (2021) to 3.15 Mt (2022) to no row (2023-24) | Direct BACI observation | HIGH |

**BACI gaps:** Same mechanism as the existing Hormuz/Druzhba `sourceGap`s: post-2022
sanctions relabel or reroute Russian crude, so RUS→JPN/KOR/CHN bilateral figures do not
cleanly separate "moved via ESPO/Kozmino" from "moved via Western Russian ports to
China/India by long-haul tanker." A `sourceGap` note (fromYear: 2022) should say exactly
this if the scenario ships.

**Recommendation:** Do not ship the RUS→CHN 0.85 figure at face value without getting the
full Reuters sentence (or a Kpler/Vortexa primary figure) — the quote fragment is the
weakest link in this whole research task. The capacity-based ~0.30 (spur only) figure is
defensible today if the maintainer prefers to model only the direct pipeline spur and
treat Kozmino as future work (mirrors how Hormuz-LNG is split from Hormuz-oil).

---

## 2. Kirkuk–Ceyhan / Iraq–Turkey pipeline

**UI description (draft):** "Northern Iraq's export route to the Mediterranean, bypassing
the Strait of Hormuz. Shut from March 2023 (Iraq–Turkey arbitration dispute) until a
partial restart in September–October 2025 at roughly half its pre-shutdown volume."

**routeName:** "the Kirkuk–Ceyhan pipeline"

**Timeline (must drive any year-conditional modelling):**
- Operating at ~450 kb/d (~370 kb/d of it KRG crude) through March 25, 2023.
- **Shut March 25, 2023 → September/October 2025** — Turkey stopped pumping after an
  ICC arbitration panel ruled Turkey had unlawfully allowed the KRG to export without
  Baghdad's consent and ordered ~$1.5bn in damages (Reuters; Wikipedia).
- **Restarted "in initial phase"** — Al Jazeera (2025-09-27): "Iraq resumes Kurdish oil
  exports to Turkiye after two-and-a-half-year halt." TRT World: North Oil Company
  resumed via the Saralo pumping station "with an initial export capacity of 250,000
  barrels per day" — roughly half the pre-2023 rate. This falls **after** the
  `public/data/trade_flow.parquet` max year (2024), so BACI cannot corroborate the
  restart volume at all.

**BACI check:** IRQ→TUR under HS 2709 has **no rows after 1998** in `trade_flow.parquet`.
This is expected, not a data bug: Ceyhan is a loading/transit port, and BACI records the
crude's final buyer (whoever purchases the cargo at Ceyhan — European refiners,
traders, etc.), not Turkey. So this scenario cannot be modelled as an `IRQ→TUR` pair; it
has to be the Iraq-wide wildcard, same pattern as Hormuz's IRQ row.

IRQ total exports (all buyers, BACI 2709) were 172-177 Mt/yr in 2021-2024, i.e.
~3.4-3.55 mb/d.

**Share table:**

| Exporter | Importer | Share | Years valid | Source title | URL | Year | Quote | Derivation | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| IRQ | null | 0.13 | 1990-2022, and Jan 1 – Mar 24, 2023 (partial year) | Reuters, "Explainer: Why oil flows through the Iraq-Turkey pipeline have been halted" | https://www.reuters.com/business/energy/why-oil-flows-through-iraq-turkey-pipeline-have-been-halted-2025-02-21 | 2025 | "On March 25, 2023 Turkey stopped pumping around 450,000 barrels per day (bpd) of Iraqi oil, including some 370,000 bpd of KRG crude, via the pipeline to Ceyhan." | 450 kb/d ÷ ~3,450-3,550 kb/d (BACI IRQ total exports 2021-2022) ≈ 0.13 | MEDIUM — clean primary quote, but the pre-2023 share was not constant over 1990-2022 (pipeline was repeatedly sabotaged 2003-2010, and KRG-independent exports only scaled up materially from ~2014 — see Wikipedia's operating history). Treating 0.13 as constant across 1990-2022 overstates exposure in the sabotage years. |
| IRQ | null | 0.00 | Mar 25, 2023 – Sep 2025 | Wikipedia, "Kirkuk–Ceyhan Oil Pipeline" | https://en.wikipedia.org/wiki/Kirkuk%E2%80%93Ceyhan_Oil_Pipeline | 2026 (accessed) | "In March 2023, the International Chamber of Commerce arbitration service ruled that the pumping agreement between the Kurdistan Region and the Turkish government was illegal, causing the pumping of petroleum products to and from the Kurdistan Region to cease." | Structural: pipeline fully shut | HIGH |
| IRQ | null | ~0.07 (250 kb/d ÷ ~3,500 kb/d) | Sep/Oct 2025 onward | TRT World, "Iraqi oil flow via Türkiye restarts amid Hormuz tensions" | https://www.trtworld.com/article/2a59d74606f1 | 2025/2026 | "operations resumed via the Saralo pumping station, with an initial export capacity of 250,000 barrels per day" | 250 kb/d ÷ ~3,500 kb/d ≈ 0.07 | LOW — a single restart-week figure ("initial capacity"), not a settled post-restart rate, and it is entirely outside the app's 1990-2024 year slider so it cannot be verified against BACI |

**Interaction with the existing Hormuz IRQ row:** the current `IRQ` Hormuz row (0.90,
`_row("hormuz","chokepoint","IRQ",...)`) already *assumes* a static ~10% northern bypass
via this exact pipeline — its `source_note` says so explicitly ("Iraq's northern
Kirkuk-Ceyhan exports (roughly 0.4 mb/d before the Mar 2023 shutdown...) bypass Hormuz,
so 0.90 is the long-run share; ~1.0 in 2023-24 while that line was shut (shares are
static across years)"). Shipping a standalone Kirkuk-Ceyhan scenario is really shipping
the year-varying version of that existing note as its own toggle. If both scenarios ship
independently without a schema change, they will disagree for 2023-24 (Hormuz still says
0.90 constant; Kirkuk-Ceyhan would say 0 for those years) — worth resolving together,
not shipping Kirkuk-Ceyhan in isolation.

**Recommendation:** Ship-worthy structurally (single clean `pipeline_id`, clean capacity
figure), but genuinely useful only if the maintainer is willing to either (a) add a
year-bounded share to the schema (this is the strongest forcing case for that in the
whole research task — years 1990-2022 vs. 2023-2024 give visibly different, and
verifiable via BACI-adjacent reasoning, results), or (b) ship a single blended static
share (e.g. weighted 0.13 × ~13/35 years operating + 0 × ~2/35 shut ≈ 0.11) with a loud
caveat, matching how Druzhba/BTC/CPC already treat "shares are static across years."

---

## 3. Saudi East-West (Petroline) — a Hormuz bypass, not an independent chokepoint

**UI description (draft):** "The Abqaiq–Yanbu pipeline (Petroline) carries Saudi crude
across the peninsula to the Red Sea, bypassing Hormuz entirely. It is Saudi Arabia's only
non-Hormuz export route — cutting it removes the ~12% of Saudi exports that currently
avoid the strait."

**routeName:** "the East-West (Petroline) pipeline"

**Should "cut East-West" be its own scenario?** Yes, but framed carefully: it is the
complement of the existing Hormuz SAU row, not an incremental new chokepoint. The
existing `ARGUS_YANBU` citation already used for the Hormuz SAU share (0.88) states:
"Kpler 2025: ~5.5 mb/d of Saudi crude shipped via Hormuz vs ~0.76 mb/d via the Red Sea
(Yanbu)". The natural "cut East-West" share is simply `1 − 0.88 = 0.12` (0.76 / 6.26 =
0.121), i.e. the fraction of Saudi exports that move via Yanbu and would be stranded if
Petroline itself were cut. **Interaction:** if the app ever supports stacking two active
disruptions (it currently appears to be single-scenario-select — worth confirming with
the maintainer), Hormuz(0.88) + East-West(0.12) sum to ~1.00, i.e. cutting both routes
would expose essentially all Saudi crude exports — a clean, checkable invariant.

**Live complication found during this research (informational, not load-bearing for the
share itself):** Al Jazeera, dated 2026-09-14 — "drones struck Saudi Arabia's East-West
oil pipeline last Thursday, prompting the kingdom to suspend operations... The 1,200km
pipeline, which carries roughly 4 to 5 million barrels of oil per day (bpd)... allowing
Saudi Arabia to bypass the Strait of Hormuz, which has largely been closed since the
outbreak of the US-Israel war on Iran in February [2026]." This describes an active,
very recent disruption in which Hormuz is already constrained and Petroline is running
far above its normal ~0.76 mb/d because it's absorbing displaced Hormuz volume — i.e.
this is the disruption scenario already playing out, not a clean baseline data point.
Do not use "4 to 5 million bpd" as the baseline share denominator; it's the number
*during* a Hormuz disruption, which is exactly the confound the existing Hormuz/CPC/BTC
rows are careful to avoid (see the file's own `_NO_BYPASS` framing).

**Share table:**

| Exporter | Importer | Share | Years valid | Source title | URL | Year | Quote | Derivation | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| SAU | null | 0.12 | 1990-2024 (static, pre-2026 baseline) | Argus Media, "Yanbu gives Aramco limited option for rerouting crude" (reused, already `ARGUS_YANBU` in the codebase) | https://www.argusmedia.com/en/news-and-insights/latest-market-news/2798868-yanbu-gives-aramco-limited-option-for-rerouting-crude | 2026 | "Kpler 2025: ~5.5 mb/d of Saudi crude shipped via Hormuz vs ~0.76 mb/d via the Red Sea (Yanbu)" (as already quoted in `build_disruption_routing.py`) | 0.76 / (5.5+0.76) = 0.121 → 0.12; consistent with IEA's design-capacity framing below | HIGH — same-tier evidence already accepted for the existing Hormuz SAU row, just complemented |
| — | — | — (design capacity context only, not a share) | — | IEA, "Strait of Hormuz" | https://www.iea.org/about/oil-security-and-emergency-response/strait-of-hormuz | 2026 | "the Abqaiq-Yanbu pipeline system (East-West Crude Pipeline or Petroline)... composed of two lines with a total design capacity of 5 mb/d of crude oil. In March 2025, Aramco reported that it had increased capacity to 7 mb/d, but sustainable flows have not been tested at this level." | Confirms Petroline's *ceiling* far exceeds its *normal utilization* (0.76 mb/d actual vs. 5-7 mb/d design) — supports treating "cut East-West" as removing the realized 0.12 share, not the theoretical capacity | HIGH (for the capacity framing) |

**BACI gaps:** none specific to this pair beyond the general caveat that BACI records
final-buyer bilateral flows, and Yanbu-loaded cargoes are fungible in the same way as any
other Saudi crude — no distinguishing signal in BACI for "moved via Petroline" vs.
"loaded at a Gulf terminal," so this share is necessarily capacity/flow-derived, not
BACI-derived, same as the existing Hormuz SAU row.

---

## 4. Canada → USA: Keystone and Enbridge Mainline

**UI description drafts:**
- Keystone: "TC Energy / South Bow's Keystone pipeline carries Western Canadian crude
  from Alberta to US Midwest and Gulf Coast refineries — about 14% of Canada's crude
  exports to the US."
- Enbridge Mainline: "Enbridge's Mainline system (Lines 1-4, 6, 65 and others) is the
  dominant route for Canadian crude into the US — roughly 60-75% of Canada's oil exports
  to the US, depending on year and whether Eastern Canada deliveries are included."

**routeName:** "the Keystone pipeline" / "the Enbridge Mainline"

**BACI check** (CAN→USA, HS 2709):

| Year | qty (t) | ≈ mb/d |
|---|---|---|
| 2022 | 194.49M | 3.91 |
| 2023 | 199.07M | 4.00 |
| 2024 | 205.34M | 4.12 |

This matches EIA almost exactly: "U.S. crude oil imports from Canada in 2023 averaged
3.9 million barrels per day" (EIA, todayinenergy id=62183) and "U.S. crude oil imports
from Canada in 2024 averaged 4.1 million barrels per day (b/d)" (EIA, todayinenergy
id=65825) — a clean cross-check that the BACI denominator is trustworthy for this pair.

**Share table:**

| Exporter | Importer | Share | Years valid | Source title | URL | Year | Quote | Derivation | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| CAN | USA (Keystone) | 0.14 | 2024-ish (2025 reported figure applied to 2024 BACI as nearest year) | CAPP, "Canadian Oil and Gas Export Infrastructure" | https://www.capp.ca/wp-content/uploads/2026/02/Canadian-Oil-and-Gas-Export-Infrastructure-February-18-2026.pdf | 2026 (data as of Sep 2025, per the report's own update note) | "South Bow Keystone 579 [thousand b/d], U.S. Ex[ports]" (2025 avg. annual throughput table, Slide 6) | 579 kb/d ÷ 4,124 kb/d (BACI CAN→USA 2024) ≈ 0.14 | HIGH — direct operator/CER-sourced throughput number, clean single-pair denominator |
| CAN | USA (Enbridge Mainline) | 0.58-0.74 (range — see caveat) | 2020 (CER) vs. 2025 (CAPP) | (a) Canada Energy Regulator, "Canada's Pipeline System 2021"; (b) CAPP, "Canadian Oil and Gas Export Infrastructure" | (a) https://www.cer-rec.gc.ca/en/data-analysis/facilities-we-regulate/canadas-pipeline-system/2021/crude-oil-pipeline-transportation-system.html ; (b) as above | (a) 2021 (describing ~2020 data); (b) 2026 (2025 data) | (a) "The Enbridge Canadian Mainline... transports about 58% of all Canadian crude oil exports."; (b) "Enbridge Mainline 3,062 [thousand b/d], U.S. Exports, Eastern Canada" | (a) 0.58 is directly stated but denominator is *all* Canadian crude exports (not just to the US); (b) 3,062 kb/d ÷ 4,124 kb/d (BACI CAN→USA 2024) ≈ 0.74, but the CAPP row's own destination label is "U.S. Exports, Eastern Canada" — some of that 3,062 kb/d serves domestic Eastern Canada refineries, not the US, so 0.74 is an upper bound | MEDIUM — two internally-consistent primary sources give different numbers because of differing denominators/years/scope; needs the maintainer to pick a convention (recommend capping around 0.65-0.70 pending a cleaner destination-only throughput figure) |

**BACI gaps:** none significant — CAN→USA is one of BACI's cleanest, best-reconciled
pairs (physical pipeline flows both sides), which is presumably why the CAPP/CER/EIA
figures all agree so closely with BACI here.

**Trans Mountain, mentioned for context (not modelled as a scenario here, since it's not
a Canada→USA route — it's Canada→tidewater/Asia, structurally more like Hormuz-bypass
logic than a US-import pipeline):** CAPP: "Trans Mountain 701 [kb/d], Marine Exports,
B.C." (2025 avg.); EIA (todayinenergy id=63564): "The Trans Mountain Expansion (TMX)
tripled the line's previous 300,000-b/d capacity when it began commercial operation in
May 2024... to 890,000 barrels per day." `pipelines.geojson` shows P0032 (CAN→None,
300 kb/d, 1953) + P0033 (CAN→None, 290 kb/d, 2024) = 590 kb/d combined in the dataset,
noticeably below the 890 kb/d nameplate reported publicly — likely because the dataset's
`capacity_kbpd` for P0033 reflects only the incremental "new pipe" segment capacity, not
system-wide capacity after looping/pump-station upgrades. Flag as a data-quality note if
Trans Mountain is modelled later.

---

## Additional candidates (brief)

**Kazakhstan–China oil pipeline.** Atasu–Alashankou (965 km, 2006) has a widely-cited
20 Mt/yr (~400 kb/d) design capacity (KazTransOil, GEM.wiki, multiple secondary sources),
but a 2026 GIS Reports piece gives the actually striking finding: "In 2024, it carried
about 10 million tons of Russian oil and 1.2 million tons of Kazakh oil" — i.e. this
"Kazakhstan–China" pipeline is now overwhelmingly a **Russian** transit route (via
swap/blend arrangements through Kazakhstan) rather than a Kazakh export route, which
inverts the naive framing. KAZ→CHN BACI has meanwhile fallen from a 2011-2013 peak of
~11 Mt/yr to 2.8-5.8 Mt/yr in 2020-2024 — consistent with "1.2 million tons of Kazakh
oil" being genuinely small. A scenario here would need two rows (KAZ→CHN small, and a
RUS "transit via Kazakhstan" row that overlaps conceptually with the ESPO story above,
since it's a third Russia→China route after ESPO and long-haul tanker).

**Sudan / South Sudan export pipelines (Petrodar + Greater Nile).** Two pipelines run
from South Sudan's oilfields (Melut Basin's Dar Blend via the ~1,500 km Petrodar line;
Unity/Heglig's Nile Blend via the older ~1,600 km Great Nile Oil Pipeline) north across
Sudan to the Bashayer Marine Terminal near Port Sudan (EIA, "Sudan and South Sudan"
analysis brief, 2014). Exports were suspended repeatedly by conflict and resumed in
January 2025 after a force-majeure lift (pgjonline.com, 2025). This is a compelling
disruption candidate (repeated real-world shutdowns, single chokepoint at Port Sudan for
a landlocked producer) but I could not source a current capacity/throughput figure
strong enough for a share table in the time budget here — worth a dedicated follow-up.

**TAL (Transalpine Pipeline).** 753 km, Trieste (Italy) → Ingolstadt/Karlsruhe (Germany),
850,000 bpd design capacity (GEM.wiki), running close to nameplate recently — TAL's own
LinkedIn account: "we transported 41.6 million tonnes of crude oil" in 2025 (≈836 kb/d).
Structurally this does **not** fit the schema: crude landed at Trieste can originate from
almost any producer (Saudi, Iraqi, West African, etc.) and the pipeline's importance is
that Germany/Austria/Czechia's inland refineries depend on it as their only seaborne
route — i.e. it's an **importer-side** chokepoint, the same shape as the already-deferred
"inbound Hormuz exposure" idea in the Phase-status notes. Not shippable without an
importer-wide wildcard concept.

---

## Part B — pipeline_id route tables (`public/data/pipelines.geojson`)

Inspected via `python3 -c "json.load(...)"`; 3,957 features total; properties are
`pipeline_id, name, status, commodity, capacity_kbpd, capacity_unit, start_country_iso3,
end_country_iso3, operator, start_year`.

### Existing scenarios (for context/verification)

| Scenario | pipeline_id(s) | Notes |
|---|---|---|
| Druzhba | P0653 (RUS→BLR, 739 kb/d), P5133 (UKR→SVK), P5134 (BLR→UKR), P5137 (UKR→HUN), P5146 (SVK→HUN), P5188 (BLR→None), P5189 (RUS→BLR), P5190 (RUS→BLR), P5207 (RUS→None), P5322 (SVK→None), P5323 (SVK→CZE), P5324 (POL→None), P5326/P5327/P5329 (DEU→None) — 17 features total under the name "Druzhba Oil Pipeline" | Highly fragmented (17 segments across RUS/BLR/UKR/SVK/HUN/CZE/POL/DEU); several Ukraine-labelled segments (P5133/P5134/P5137) carry the southern branch even though Ukraine is not itself a `disruption_route` row (pure transit country) |
| BTC | P0644 (AZE→TUR, "Baku-Tbilisi-Ceyhan Pipeline", 1,200 kb/d, 2006) | Single clean feature; Georgia transit not reflected in start/end country fields (only in the LineString geometry) |
| CPC | P0646 (KAZ→RUS, "Caspian Pipeline", 1,340 kb/d, 2001) | Single clean feature; end country RUS reflects the Novorossiysk (Black Sea) terminus, not a second disruption_route pair |

### New candidates

| Scenario | pipeline_id(s) | Notes |
|---|---|---|
| ESPO | Trunk: P0654 (RUS→None, 1,607 kb/d, 2009), P2023 (RUS→None, 1,004 kb/d, 2012), P6349 (RUS→None, 1,004 kb/d, 2013) — parallel Taishet–Skovorodino/Kozmino lines. Border-crossing spur: **P5174 (RUS→CHN, "Skovorodino-Mohe Oil Pipeline", 602 kb/d, 2010)** — this is the actual cross-border connector and its capacity (602 kb/d) is a good independent match to the USCC testimony's ~570-630 kb/d spur estimate. China-side continuation: P2024 and P5241 (both CHN→None, 301 kb/d each — two parallel Mohe–Daqing lines summing to ~602 kb/d, consistent with P5174). Upstream feeders (optional, smaller): P2293 (Chayanda tie-in, 30 kb/d), P2456 (Yarakta tie-in, 70 kb/d). | Kozmino port itself is not a pipeline endpoint in this file — it should be looked up as a `port`/terminal asset in `assets.parquet`, not a `pipeline_id`. No feature is named "ESPO"; all use "Eastern Siberia–Pacific Ocean Oil Pipeline" |
| Kirkuk–Ceyhan | P0547 (IRQ→TUR, "Kirkuk-Ceyhan Oil Pipeline", 1,400 kb/d, 1976) | Single clean feature. Exclude P0577 ("Kirkuk Baiji Baghdad Oil Pipeline", IRQ→None, 40 kb/d) — that's a domestic feeder, not part of the export route, and P6827 (gas, irrelevant commodity) |
| Saudi East-West / Petroline | P0551 (SAU→None, "East-West Crude Oil Pipeline", 5,000 kb/d, 1982) | Single clean feature; capacity matches IEA's "total design capacity of 5 mb/d" almost exactly. **Naming gotcha:** P3962 "East–West Gas Pipeline (Saudi Arabia)" (en-dash, gas commodity) is a false-positive on substring search and must be excluded; also exclude the NGL lines P1896 (Abqaiq–Yanbu NGL) and P6552 (Rabigh–Yanbu NGL) |
| Keystone | P0024 (CAN→USA, "Keystone Oil Pipeline", 700 kb/d, 2010) — this is the actual border crossing | US-side laterals/extensions in the file (P5136, P5156, P5157 all USA→None; P2550 HoustonLink; P3159 Port Neches Link) are downstream of the border and should not be double-counted as separate "cut Keystone" segments — cutting P0024 alone stops flow into all of them |
| Enbridge Mainline | Border-crossing segments only: P0008 Line10 (CAN→USA, 74 kb/d), P0010 Line1 (CAN→USA, 237 kb/d), P0011 Line2 (CAN→USA, 442 kb/d), P0013 Line4 (CAN→USA, 796 kb/d), P0016 Line65 (CAN→USA, 186 kb/d), P1991 Line3 (CAN→USA, 844 kb/d) — sums to 2,579 kb/d design capacity | Sum (2,579 kb/d) is noticeably below CER's reported ~3,062 kb/d 2025 average throughput for "the Mainline" — the dataset's static `capacity_kbpd` is evidently a stale/nameplate figure for at least one of these lines (uprates aren't reflected). Domestic-only segments to exclude: P0009 Line11, P0017 Line7, P0018 Line9 (all CAN→None, stay within Canada); reverse-direction segments to exclude: P0014 Line5 and P0015 Line6 (both USA→CAN — carry crude back into Ontario/Quebec, not part of the export measure); US-side continuations to exclude: P0067 Line14/64, P0068 Line17, P0069 Line61, P0070 Line79 (all USA→None, downstream of the border) |
| Trans Mountain (context only) | P0032 (CAN→None, "Trans Mountain Oil Pipeline", 300 kb/d, 1953), P0033 (CAN→None, 290 kb/d, 2024) | Combined 590 kb/d in the dataset vs. 890 kb/d nameplate reported publicly post-TMX (2024) — a capacity discrepancy to flag if this pipeline is ever modelled, not just noted |
| Kazakhstan–China (candidate) | P0648 (KAZ→CHN, "Kazakhstan-China Oil Pipeline", 402 kb/d, 2006), P5197 (KAZ→None, 201 kb/d, 2009) | Two features; neither is tagged with a "transit Russian oil" flag, so the RUS-via-Kazakhstan volume described by GIS Reports is not separately identifiable in this dataset's properties |
| Sudan/South Sudan (candidate) | Not found by name search ("Sudan", "Melut", "Port Sudan" all returned zero matching pipeline features) | The GEM oil-infrastructure tracker this dataset derives from appears not to cover Sudan/South Sudan pipelines at all — would need a fresh ingest, not just a scenario/registry change |
| TAL (candidate) | P0679 (ITA→DEU, "Transalpine Oil Pipeline", 850 kb/d, 1967), P6261 (DEU→None, capacity null) | Two features; matches GEM.wiki's 850,000 bpd design capacity for the main line |

---

## Recommendations (ship order)

1. **Keystone + Enbridge Mainline (Canada→USA).** Cleanest data on every axis: single
   `pipeline_id` (Keystone) or a well-defined set (Mainline), a well-reconciled BACI pair,
   and multiple independent primary sources (CAPP, CER, EIA) agreeing on magnitude. Ship
   Keystone at HIGH confidence now; ship Mainline with the 0.58-0.74 range flagged and a
   maintainer decision on which convention to use.
2. **Saudi East-West / Petroline.** Reuses evidence already in the codebase
   (`ARGUS_YANBU`); just needs the complementary 0.12 row added. Low implementation risk,
   HIGH confidence, and it directly strengthens the existing Hormuz SAU story rather than
   adding a new unrelated claim.
3. **Kirkuk–Ceyhan.** Ship-worthy structurally, but decide first whether to add a
   year-bounded share (recommended — this is the cleanest real-world forcing case for
   that feature) or accept a blended static number with a loud caveat. Either way, update
   the existing Hormuz IRQ `source_note` at the same time so the two scenarios don't
   silently disagree for 2023-24.
4. **ESPO.** Needs one more research pass to get a verified full quote (not a snippet) for
   the "1.9 million bpd combined" figure, ideally from the original Reuters piece or a
   Kpler/Vortexa-sourced number, before shipping a RUS→CHN share above LOW-MEDIUM
   confidence. The capacity-only ~0.30 spur figure is defensible today as a smaller,
   more honest first cut.
5. Kazakhstan–China, Sudan/South Sudan, TAL: not ready to ship. Sudan/South Sudan needs a
   fresh GEM ingest (pipelines aren't in the current dataset at all). TAL needs a schema
   change (importer-wide wildcard). Kazakhstan–China is ready for a small table but is
   arguably a footnote on the ESPO/Russia-to-China story rather than a standalone
   scenario worth its own UI toggle.

## Open questions for the maintainer

1. **Does the scenario UI support stacking two active disruptions at once?** The
   Hormuz+East-West "sum to ~1.00" invariant is only interesting if a user can see both
   at the same time (or if the map computes a combined "no bypass left" state). If
   scenarios are strictly single-select, the East-West scenario should probably describe
   itself relative to Hormuz in its UI copy rather than relying on the user to combine
   them mentally.
2. **Is a year-bounded share worth adding to `DisruptionRouteRow`/`build_disruption_routing.py`/`engine.ts`?**
   Kirkuk–Ceyhan is the first candidate where this would change what the map actually
   shows across the 1990-2024 slider (as opposed to Druzhba/BTC/CPC, where a static share
   is a reasonable simplification because the underlying reality didn't change sharply
   within the covered years — well, Druzhba's Belarus/Poland/Germany rows do have a real
   2022 break, currently handled entirely via the `sourceGap` text rather than the share
   itself). Worth deciding as a policy once, rather than ad hoc per scenario.
3. **Should Kozmino be added to `assets.parquet` as a named port/terminal**, so ESPO
   (and any future Russia-Pacific scenario) can reference it the way CPC references
   Novorossiysk implicitly via `end_country_iso3`? Currently there's no clean anchor for
   "the Kozmino bottleneck" distinct from "the RUS→CHN pipeline spur."
4. **Full-sentence verification for the ESPO "1.9 million bpd" Reuters/gwaramedia figure**
   — I could not fetch gwaramedia's full article text in this pass (only the search
   snippet); worth a dedicated fetch or a Kpler/Vortexa citation instead before shipping.
5. **Sudan/South Sudan pipelines are absent from the GEM-derived `pipelines.geojson`
   entirely** (not a filtering issue — the source tracker itself appears not to cover
   them). If this corridor is wanted, it's a data-ingest task, not just a scenario/registry
   addition.

---

# Verification (independent, 2026-09-19)

Task RV. Every cited URL was re-opened (Tavily `extract` / direct `curl`), every share
recomputed against `public/data/trade_flow.parquet` (BACI HS 2709, 1 t = 7.33 bbl), and
every `pipeline_id` re-checked against `public/data/pipelines.geojson`. Verdicts below are
against the note above, not against the existing shipped rows.

**Headline: 3 errors would have shipped wrong numbers or wrong provenance** — the Enbridge
Mainline 0.74, the Kirkuk–Ceyhan restart row (wrong pipeline, wrong year), and the ESPO
0.85 (a three-route wartime figure divided by a one-route peacetime denominator). One Part B
claim ("Sudan pipelines are absent from the dataset") is false.

## Verdict table

| Row / figure | Verdict | What the source actually says | Corrected value |
|---|---|---|---|
| **ESPO** RUS→CHN 0.85, from "1.9 million b/d", cited to gwaramedia, "2024/2025 (undated)" | **MISAPPLIED** (and mis-dated) | Original Reuters wire (findable, and it should be the citation): "Russia continues uninterrupted supplies via pipelines to China, including the **Skovorodino-Mohe and Atasu-Alashankou** routes, as well as ESPO Blend exports by sea via the port of Kozmino. Together, **the three routes** account for some 1.9 million bpd" (reuters.com/business/energy/least-40-russias-oil-export-capacity-halted-reuters-calculations-show-2026-03-25). The gwaramedia page is dated **26 March 2026**, not 2024/2025, and its paraphrase silently drops Atasu-Alashankou. | **Hold.** 1.9 mb/d spans three routes — one of which is the note's own separate "Kazakhstan–China" candidate — and Kozmino ESPO Blend is sold FOB to Asia generally (Argus: China lifts 65–80% of Kozmino volumes), not all to China. It is also a **March 2026 wartime residual**, measured after Ukrainian drones shut ~40% of Russian export capacity, divided by a 2024 peacetime BACI denominator. Best defensible band if forced: ~0.60–0.70, not 0.85. |
| **ESPO** spur-only ~0.30 (USCC/Downs) | **CONFIRMED (quote); value slightly high** | Downs, USCC, **21 March 2019**, verbatim: "It has a capacity of 1.2 million barrels per day of which around 630,000 bpd go to Kozmino." Real URL is `https://www.uscc.gov/sites/default/files/Downs_Testimony...pdf` (the ellipsis is literally in the filename; the note's URL is missing `.pdf`). Corroborated: PGJ 2019 "a major oil pipeline to China... today is shipping 600,000 bpd"; `pipelines.geojson` P5174 = 602 kb/d. | **0.28**, not 0.30 (602 ÷ 2,180 kb/d = 0.276; BACI RUS→CHN 2024 = 108.47 Mt = 2,180 kb/d exactly). Label it design capacity, not metered flow. |
| **ESPO** RUS→JPN 0, RUS→KOR 0 | **CONFIRMED** | BACI reproduced exactly: JPN 4.469 Mt (2021) → 1.925 (2022) → 0.092 (2023) → no row; KOR 10.219 (2021) → 3.145 (2022) → no row. | As stated. These are observations, not route shares — do not ship them as `disruption_route` rows. |
| **Kirkuk–Ceyhan** IRQ-wide 0.13 (450 kb/d ÷ "3,450–3,550") | **CONFIRMED quote, WRONG denominator label** | Reuters 2025-02-21 verbatim: "On March 25, 2023 Turkey stopped pumping around 450,000 barrels per day (bpd) of Iraqi oil, including some 370,000 bpd of KRG crude, via the pipeline to Ceyhan." The same piece independently supports the share: "Iraq... exports about **85%** of its crude via ports in the south." | BACI IRQ totals in kb/d: **2021 = 3,209** (not 3,450), 2022 = 3,546, 2023 = 3,463, 2024 = 3,484. So 450 kb/d = **0.14** in 2021, **0.127** in 2022. Ship **0.13** (or 0.14) — but see the Hormuz-consistency problem below. |
| **Kirkuk–Ceyhan** 0.00 for the shut period | **CONFIRMED** | Reuters (above) + Al Jazeera 2025-09-27 + Argus 2025-09-26 all agree: halted 25 Mar 2023, restarted **27 September 2025**. | Dates confirmed exactly as the note states them. |
| **Kirkuk–Ceyhan** ~0.07 from "250 kb/d, Sep/Oct 2025, TRT" | **MISAPPLIED — wrong pipeline and wrong year** | The TRT article is not about the Sept 2025 KRG restart. It is a **2026** piece ("WAR ON IRAN" section; "closure of the Strait of Hormuz during the war on Iran"; "attacks... since February 28") about **Iraq's North Oil Company** restarting the **federal Kirkuk** line, which it says "was shut **for more than a decade**... halted in **2014** after repeated attacks by Daesh." That is a different line from the KRG line shut in March 2023. | **Drop this row.** The Sept 2025 KRG restart was ~**230 kb/d** (Arab Weekly; Iraq's oil minister expected ~300 kb/d), i.e. ~0.065–0.086 — and it is outside the 1990–2024 slider anyway. If a 2026 row is ever wanted, it is *both* restarts (≈230 + 250 kb/d), not one. |
| **Saudi East-West** SAU-wide 0.12 = 1 − 0.88 | **CONFIRMED arithmetically, MISAPPLIED as a flat share** | IEA Hormuz table (full-year 2025, Kpler): Saudi crude via Hormuz **5.43 mb/d**. BACI SAU 2024 total = 309.16 Mt = **6,208 kb/d** → implied non-Hormuz ≈ 0.78 mb/d, so 0.78/6.21 = **0.125**. The Argus 0.76 figure and the 0.88 complement both reconcile against BACI. | Value **0.12 is sound as a national average**, but see "Logic checks" — as an exporter-wide wildcard it is wrong per-importer in a way that consumes the entire signal of the scenario. |
| **IEA** Petroline design-capacity quote | **CONFIRMED verbatim** | "The system is composed of two lines with a total design capacity of 5 mb/d of crude oil. In March 2025, Aramco reported that it had increased capacity to 7 mb/d, but sustainable flows have not been tested at this level." | As quoted. **The note omits the next sentence**: "As of early 2026, it is estimated that **about 2 mb/d of the pipeline's capacity is used**." That is crisis-period, not baseline (2 + 5.43 = 7.4 mb/d would exceed total Saudi crude exports in BACI by ~1.2 mb/d), and it also includes Yanbu refinery feed, not only export loadings. Do not let it displace 0.76. |
| **Keystone** CAN→USA 0.14 | **CONFIRMED — and independently corroborated** | CAPP PDF verified verbatim, Slide 6: "South Bow Keystone **579** … U.S. Exports". Better still, the CER page the note also cites states the share directly: "The Keystone Pipeline… transports **about 14%** of western Canadian crude oil exports." | **0.14.** Two independent routes land on the same number. Only caveat: CAPP footnote (1) is "2025 is the average from **Jan.-Sep.**", not a full-year 2025 average as the note says. |
| **Enbridge Mainline** CAN→USA "0.58–0.74" | **0.74 WRONG (unit/scope error); range resolvable** | CAPP quotes verified: "Enbridge Mainline(3) **3,062** U.S. Exports, Eastern Canada", footnote (3) "**Ex-Gretna**". But CAPP's own lead-in says the table measures "~4.7 MMB/d of **crude oil and NGLs**", and its total is **4,745 kb/d** — which is **larger than all Canadian crude exports in BACI 2024 (4,367 kb/d)**. A numerator that includes NGLs and Eastern-Canada deliveries cannot be divided by a crude-only CAN→USA denominator. CER verified verbatim: "The Enbridge Canadian Mainline… transports about **58%** of all Canadian crude oil exports." | **Ship 0.60.** Derivation: CER 58% is of *all* Canadian crude exports; BACI 2020 (the CER vintage) gives CAN total 181.71 Mt vs CAN→USA 175.03 Mt, so the CAN→USA-basis share = 0.58 × (181.71/175.03) = **0.602**. Sanity check: 0.60 (Mainline) + 0.14 (Keystone) + 0.10 (Express/Rangeland/Milk River, 403 kb/d) = 0.84, leaving room for Trans Mountain's Puget Sound barrels and rail. At 0.74 the same sum exceeds 1.0 — arithmetically impossible. |
| **EIA** cross-checks 3.9 / 4.1 mb/d | **CONFIRMED verbatim** | id=62183: "U.S. crude oil imports from Canada in 2023 averaged 3.9 million barrels per day (b/d)". id=65825: "…in 2024 averaged 4.1 million barrels per day (b/d)". | BACI reproduces both: 2023 = 3,998 kb/d, 2024 = 4,124 kb/d. Denominator is trustworthy. |
| **BACI tables** (RUS→CHN/JPN/KOR/IND; CAN→USA; IRQ; KAZ→CHN) | **CONFIRMED** | Re-run independently; every figure in the note's tables matches to the digit. | — |
| **2026 Hormuz war / Petroline drone attack** | **CONFIRMED (substance), dates off** | Real and corroborated across Al Jazeera (**published 12 Sep 2026**, not 09-14), Wikipedia "2026 East–West Crude Oil Pipeline attack", AP/CNBC-derived reporting: drone strikes **10–11 Sep 2026** from Iraqi territory; Saudi shut the line; AJ: "The East-West pipeline has been moving four million to five million barrels of oil per day… **It had increased capacity specifically to help mitigate the disruption** to Saudi oil exports in the Strait of Hormuz"; Wikipedia: "Saudi Arabia had **rerouted** about 5 million barrels of oil per day that would otherwise have moved through the Gulf." Hormuz effectively closed **since March 2026** (AJ), war began **28 Feb 2026**. | The note's judgement — **do not use 4–5 mb/d as a baseline denominator** — is correct and is the single best call in the note. Fix the date ("since February") to March 2026 for the Hormuz closure. |
| **Kazakhstan–China** "10 Mt Russian / 1.2 Mt Kazakh in 2024" (GIS Reports) | **UNVERIFIABLE as stated; partly contradicted** | Not re-opened. The Russia-transit direction is independently corroborated — the Reuters 2026 wire names **Atasu-Alashankou** as one of the Russia→China routes. But BACI KAZ→CHN 2024 = **2.79 Mt**, 2.3× the "1.2 million tons of Kazakh oil" the note called "consistent". | Treat the split as unsourced until GIS Reports is re-read. Note it double-counts against ESPO's 1.9 mb/d. |
| **TAL** "41.6 million tonnes in 2025" (TAL LinkedIn) | **UNVERIFIABLE** | Not re-opened; a corporate social post is below the bar the rest of the file holds. Context only, so low stakes. | Re-source from TAL's annual report before it is ever used as a share. |
| **Trans Mountain** dataset 590 vs 890 kb/d nameplate | **CONFIRMED, and sharper than stated** | CAPP: "The Trans Mountain Expansion Project (TMEP), now complete, has added **~590 MB/d** of egress capacity"; EIA id=63564 gives 890 kb/d post-expansion. | The dataset's P0033 = 290 kb/d understates the actual 590 kb/d increment by half (not merely "the incremental new pipe"). 300 + 590 = 890 ✓. Worth a data-quality note. |

Counts: **7 CONFIRMED · 1 WRONG · 4 MISAPPLIED · 2 UNVERIFIABLE** (plus the Part B corrections below).

## Logic checks

**(a) "Cut East-West = 0.12, the complement of the Hormuz SAU 0.88."** The arithmetic is
right and the 0.12 reconciles independently against BACI. The *modelling* does not.
`engine.ts` applies an exporter-wide share to **every** importer identically, so a SAU-wide
0.12 says each of Saudi Arabia's buyers loses exactly 12% of its Saudi barrels. That is
false in the direction that matters: Yanbu/Red Sea loadings serve Mediterranean, North-West
European and Red Sea buyers, while Asian buyers (China, India, Japan, Korea — 44% of Hormuz
crude per IEA) are served from Ras Tanura/Juaymah inside the Gulf. A Petroline cut is
concentrated on European buyers and near zero for Asian ones. The share is **not
direction-independent**, and unlike the Hormuz SAU row (where the bias hides inside 0.88 ≈ 1)
here the bias *is* the whole output: the scenario would render as a flat 12% haircut on every
country, which is the one shape guaranteed to be wrong everywhere.
The existing pair-override mechanism can fix this (pair rows beat the wildcard), but only
with a per-destination split of Yanbu loadings that nothing in this note sources.
Secondary point: the interesting fact about Petroline is that it is the *Hormuz bypass*, which
a single-select scenario UI cannot express — the 2026 events are exactly the compound case
(Hormuz shut *and* Petroline shut) and the app cannot represent it.

**(b) Kirkuk–Ceyhan as an Iraq-wide wildcard.** 450 kb/d against BACI Iraqi exports is
**0.14 (2021) / 0.127 (2022)**; the note's "3,450–3,550 for 2021-2022" mislabels 2021 by
240 kb/d. Reuters' own "about 85% via ports in the south" supports 0.13–0.15, so 0.13 is
defensible, at the low end.
**But it contradicts a row already shipped.** The `hormuz` IRQ row is 0.90, i.e. a 0.10
northern bypass, and its `source_note` says that bypass *is* this pipeline. Shipping
Kirkuk–Ceyhan at 0.13 while Hormuz IRQ implies 0.10 puts two numbers for the same corridor
on the same page. Whatever ships, the two must be set together (0.13/0.87 or 0.10/0.90).
IEA's 2025 table (Iraq 3.32 mb/d through Hormuz vs BACI 2024 total 3,484 kb/d → 0.95)
supports the note's separate claim that the true Hormuz share was ~1.0 while the line was shut.
Dates verified: shut 25 Mar 2023 (Reuters), restarted 27 Sep 2025 (Al Jazeera/Argus) — so
**the entire shut period lies inside the 1990–2024 slider for 2023 and 2024**, i.e. two of the
map's 35 years show a live pipeline that was in fact shut. That is the real defect.

*Recommended handling of shut years.* Don't add a year field to `DisruptionRouteRow` —
that changes the parquet schema, `engine.ts`, the CSV export, `/methodology` and the
data-integrity tests for one scenario. Put it in the registry instead, beside the existing
`sourceGap` pattern, which already solves "this number is wrong from year N":

```ts
readonly activeYears?: { readonly from?: number; readonly to?: number };
readonly inactiveNote?: string;   // shown when the year is outside activeYears
```

`ScenarioPanel` then disables (or annotates and zeroes) the scenario for 2023–2024 with
"The Iraq–Turkey pipeline was shut from 25 March 2023 to 27 September 2025; there is no
exposure to model in this year." This is pure UI, testable in Vitest, and generalises to
Druzhba's 2022 break — which today is handled only by `sourceGap` prose while the share
stays 0.47/1.00.

**(c) ESPO primary sourcing.** There is no single primary figure for "Daqing spur + Kozmino
to China", but the components exist and are better than the note's snippet:
Reuters 2026-03-25 (the wire, not the aggregator) for the three-route 1.9 mb/d;
Downs/USCC 2019 for the 1.2 mb/d trunk / 630 kb/d Kozmino split;
Reuters 2022-06-07 for Kozmino loadings ("In 2021, Kozmino loaded about 720,000 bpd
(35.1 million tonnes)", capacity "up to 1.1 million bpd"); Reuters 2025 for current
loadings ("4 million metric tons (some one million barrels per day)");
Argus for the destination split ("China… lifting 65-80pc of the monthly volumes exported
from the Kozmino terminal").
**Recommendation: hold the combined scenario; ship the spur alone if anything ships.** The
only row I would stand behind today is:

```
_row("espo_spur", "pipeline", "RUS", "CHN", 0.28, SRC_IEA_PIPELINE, DOWNS_USCC_2019,
     "Downs (USCC, 2019): the ESPO trunk has 'a capacity of 1.2 million barrels per day of "
     "which around 630,000 bpd go to Kozmino', leaving ~570 kb/d for the Skovorodino-Mohe "
     "spur to Daqing; GEM P5174 gives the spur 602 kb/d. 602 / 2,180 kb/d (BACI RUS->CHN "
     "2024) = 0.28. Design capacity, not metered flow. Kozmino seaborne ESPO Blend is "
     "deliberately excluded: it is sold FOB to Asian buyers generally and cannot be "
     "separated in BACI from Urals crude reaching China by long-haul tanker.")
```

with a `sourceGap` from 2022 in the same words the note proposes.

## Part B — id-list corrections

| Item | Correction |
|---|---|
| **Sudan / South Sudan "not found by name search"** | **False.** `P0537 "Greater Nile Oil Pipeline"` — crude, 250 kb/d, SSD → (null), start_year 1999, operating — is in `pipelines.geojson`. A search for "Nile" finds it; the note searched "Sudan", "Melut", "Port Sudan" only. Petrodar genuinely is absent. So this is **not** a fresh-ingest task, and open question 5 should be withdrawn. |
| **Druzhba** | The note says "17 features total" but lists **15**. Missing: **P6307** (BLR→UKR, 753.08 kb/d, 1974) and **P7280** (RUS→BLR, 120.49 kb/d, 1974). |
| **Enbridge exclusions** | The "domestic-only to exclude" list (P0009, P0017, P0018) is incomplete. Also Canada-side and not border crossings: **P2096** (Line 8, 90 kb/d), **P2532** (Line 20), **P3871** (Line 93, 844 kb/d, 2019), **P5262** (Line 32), **P5356** (Line 75, 550 kb/d), **P6487** (Line 74). Also US-side, in addition to those listed: **P2554** (Line 78, 570 kb/d), **P2618** (a second Line 61 row, 300 kb/d). P3871 (Line 93 = the US leg of Line 3) is mislabelled `CAN` in the dataset — exclude it, or it double-counts P1991. |
| **Enbridge border set** | The six listed ids all exist with the stated names, commodities and capacities; 74+237+442+796+186+844 = **2,579 kb/d** ✓. Note that Line 1 (P0010) is the system's light/NGL line in reality though the dataset tags it `crude`. |
| **Kirkuk–Ceyhan P0547** | Exists as described (IRQ→TUR, crude, 1,400 kb/d, 1976) — but `status` is **"operating"** and `start_year` 1976, so with a vintage-aware layer the line renders as live for 2023–2024 when it was shut. Same defect as the share. |
| **BTC P0644** | Exists; `commodity` is **`crude+ngl`**, not plain crude (the note omits this). |
| **ESPO** | All listed ids verified. Two additions to the exclusion list, both Chinese downstream distribution rather than the corridor: **P2410** (Daqing-Jinxi, 201 kb/d), **P2411/P2412** (Daqing–Tieling, 402 / 602 kb/d). Also: P2024 and P5241 are both named "Eastern Siberia–Pacific Ocean Oil Pipeline" in the file — "two parallel Mohe–Daqing lines" is the note's inference, not a dataset fact (their 2011 and 2018 start years are consistent with it). |
| **Everything else** | P0654/P2023/P6349/P5174/P2293/P2456, P0551 (+ the P3962/P1896/P6552 exclusions), P0024 (+ US-side exclusions), P0032/P0033, P0648/P5197, P0679/P6261, and all 15 listed Druzhba ids: **all confirmed**, with the stated names, commodities, capacities, endpoints and start years. |

## Ship / hold

| Scenario | Recommendation |
|---|---|
| **Keystone** | **SHIP.** `_row("keystone","pipeline","CAN","USA",0.14, …)` citing **CER, "Canada's Pipeline System 2021"** for the directly-stated "about 14% of western Canadian crude oil exports", with CAPP's 579 kb/d ÷ BACI 4,124 kb/d (2024) = 0.140 as the corroborating derivation in `source_note`. Map: **P0024 only**. |
| **Enbridge Mainline** | **SHIP at 0.60, not 0.58–0.74.** Cite CER ("about 58% of all Canadian crude oil exports"); `source_note` carries the conversion to the CAN→USA basis (0.58 × 181.71/175.03 = 0.602, BACI 2020) and states plainly that CAPP's 3,062 kb/d is **not** usable as a numerator because it is crude+NGL ex-Gretna including Eastern-Canada deliveries — CAPP's own table total (4,745 kb/d) exceeds all Canadian crude exports in BACI. Map: the six CAN→USA segments, minus P3871. |
| **Saudi East-West / Petroline** | **HOLD** in its proposed form. The 0.12 is right as a national average and wrong as a flat per-importer share (Logic (a)); shipping it would produce a uniform 12% haircut on every buyer, which is the one answer that is wrong for all of them. Ship it only with destination-split pair rows, or ship it as a *modifier* of Hormuz once the UI can stack two disruptions. Reusing `ARGUS_YANBU` is otherwise fine and the 2026 attack figures must stay out of the denominator. |
| **Kirkuk–Ceyhan** | **HOLD until the shut-year handling lands**, then ship **one** row, IRQ-wide, at **0.13**, citing the Reuters explainer, *and* change the `hormuz` IRQ row to **0.87** in the same commit so the two agree. Drop the 0.07 restart row entirely (wrong pipeline, wrong year, outside the slider). Add registry `activeYears: { to: 2022 }` + `inactiveNote` for 2023–2024. Map: **P0547 only**. |
| **ESPO** | **HOLD the 0.85.** It divides a three-route, China-plus-Asia, March-2026 wartime figure by a one-route 2024 denominator. If anything ships, ship the spur-only row at **0.28** (Downs/USCC, GEM P5174) as written above, with the Kozmino leg explicitly out of scope. |
| **Kazakhstan–China / Sudan / TAL** | Unchanged: not ready. But **Sudan is a scenario/registry question, not a data-ingest one** — P0537 is already in the dataset; what is missing is a sourced throughput figure, and Petrodar geometry. |
