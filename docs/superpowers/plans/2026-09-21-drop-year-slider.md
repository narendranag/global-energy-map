# Plan: drop the year slider; state data vintages instead

> 2026-09-21. Maintainer decision: "Drop the time slider entirely. We will ALWAYS have data up to
> different years, but should be able to show scenarios regardless. Be honest about the vintage of
> the data sets during the scenario analysis." And: **honour `year=` in links, with an "as of" chip.**
> Supersedes steps 6–7 of `../briefs/2026-09-21-scenario-first-framing-recommendation.md`; its steps
> 1–5 (lead copy, intro card, visible headline, empty state) are folded in here.
> Research behind this plan: the two agent reports summarised in that brief's session.

## Decisions

1. **UI-only removal. `AppState.year` stays.** The engine, country panel, exports and vintage filter
   are year-parameterised and keep being so; nobody *chooses* the year any more. Taking `year` out of
   the model is 40+ files and breaks every shared link, for no user-visible gain.
2. **The year is the latest reconciled trade year** (`TRADE_LAST_YEAR`, 2024 today), derived, not a
   new constant. `DEFAULT_YEAR` 2020 → that. Reserves are unaffected (`reservesDataYear` already
   caps at 2020). Flows mode keeps its own `FLOWS_DEFAULT_YEAR` reasoning only if it still differs —
   otherwise delete it.
3. **`year=` is still decoded and still written on every link** (`encode.ts:139` unchanged). A link
   is a citation: when BACI 2025 lands, a link copied today must keep showing 2024 numbers. No
   encode/decode change, so the old-link contract tests stand as written.
4. **The "as of" chip.** When `state.year !== latest`, a chip reads "As of 2010 · View latest";
   the button patches `year` to latest. It replaces the slider at bottom-centre, is shown in embed
   too (it is essential to reading the numbers), and is absent at the latest year. Everything
   downstream (vintage filter, engine, CSV) behaves exactly as today for such a link.
5. **At the latest year the vintage filter hides nothing.** With no way to scrub forward, a row
   dated after 2024 would vanish for good; show all rows when `year === latest`, apply
   `isVisibleAtYear` only for a pinned historical link. One predicate, in `src/lib/vintage/`.
6. **The "Which pipelines existed in 1995?" example question goes**; replace with a third scenario
   question (Malacca or Suez, latest year). Druzhba and Qatar-LNG examples move to the latest year
   unless their copy depends on the year — Druzhba's `sourceGapNote` (from 2022) still fires at 2024.
7. **Vintage disclosure is derived** — `scenarioVintage(result, routes, {catalog, today})` in
   `src/lib/scenarios/vintage.ts`, from catalog `coverage`/`as_of` via the `scenario:<id>` layer tags
   and from the route rows' own `source_year` (never `disruption_route.as_of`). No literal year in
   any component.

## Work, in commit order

**T1 — pure: `src/lib/scenarios/vintage.ts`** (TDD, `tests/unit/scenarios/vintage.test.ts`).
`scenarioVintage` → `{ tradeYear, rows[{role,label,sources,through,dataEnd,stale}], spreadYears,
mismatchNote }`; roles trade / route_shares / assets / attribution. Reuses `layerVintage`,
`isStale`, `staleNote`, `formatVintage` from `src/lib/data/vintage.ts`. Mismatch note only when
spread ≥ 3 years. A stale BACI row cites `cadence` ("annual, Jan–Feb") so "old" does not read as
neglect. Mind `-lng` (catalog tag) vs `_lng` (`routeKeyFor`).

**T2 — pure: defaults, examples, badges.** `src/lib/modes/index.ts` (decision 2, 6),
`src/lib/time/range.ts`, `src/lib/symbology/time-aware.ts`: `timeAwareLabel` becomes the layer's
vintage (`formatVintage(layerVintage(..))` — "to 2020", "as of 9 Apr 2025", "live"); the hand-kept
coverage percentages stay only in the hover note, reworded to describe the data, not a control.
`src/lib/vintage/` gets decision 5. Unit tests alongside.

**T3 — remove the control.** Delete `src/components/time-slider/`, `src/lib/time/relevance.ts`,
`useAppYear`'s slider consumer, their unit tests, `tests/e2e/time.spec.ts`,
`tests/e2e/year-relevance.spec.ts`. `page.tsx`: drop the slider block; mount `AsOfChip`
(`src/components/ui/AsOfChip.tsx`, decision 4). Reserves "latest is 2020" note becomes unconditional
(`page.tsx:223`, `ReservesChoropleth.tsx:101`, legend title). `LayerPanel`: badges from T2; the
"no data this year" badge only matters for pinned links — keep. Keep DOM/focus order; footer's last
link stays "Methodology".

**T4 — the scenario says its answer and its data.** `ScenarioPanel.tsx`: the `sr-only` announcement
becomes a visible headline, "**Strait of Hormuz — on 2024 trade:** 14 importers exposed…" (keep
`data-testid="scenario-announcement"` + `aria-live`); a `<details>` "Data behind this result" fed by
T1, with the "old" marker. `src/lib/scenarios/summary.ts` gains the "on 2024 trade" part so ShareMenu
and the embed chip follow. `registry.ts` `howComputed` copy reviewed for "the year you chose" phrasing.
`src/lib/export/scenario.ts`: header lines `# Trade year:` and `# Data vintages:`; the byte-pinned
importer fixture is updated **deliberately, in this commit**. Empty state: with no scenario picked
the panel shows the question + the scenario `EXAMPLE_QUESTIONS` (hidden under embed).

**T5 — framing copy.** Intro card: scenario bullet first, no "Slide through time", the coverage box
becomes one derived line ("Scenarios run on reconciled trade through {year}; {n} layers carry newer
data, to {date}. How current each layer is →"). `README.md`, `layout.tsx` description, `Header.tsx`
tagline, `public/llms.txt`, `CITATION.cff`: question-first lead, no "1990–2024", scenario list no
longer stuck at five. `docs/methodology.md`, `docs/researchers/*`, `CLAUDE.md` (conventions that
mention the slider), `docs/legal` untouched. `docs/announce/` stays the maintainer's.

**T6 — e2e.** Rewrite slider interactions in `url`, `scenarios`, `share`, `scenario-map`,
`country-panel`, `modes`, `a11y` specs: years now arrive by URL. New `as-of.spec.ts`: a `year=2010`
link shows the chip, renders 2010 numbers, "View latest" clears it; a bare `/` shows no chip.
Verification standard unchanged: `pnpm build && CI=1 pnpm exec playwright test`, plus lint,
typecheck, Vitest.

## Not doing
Removing `year` from `AppState` or the URL; changing `DEFAULT_MODE`; touching country-panel
sparklines (a time *series*, not the slider — they are now the one place the years are visible).

## Outcome (2026-09-21, `97c0688`…`9aa8c3c`)

Shipped as planned, T1–T6 in order, plus two same-day follow-ups the plan didn't anticipate:

- **T1–T3** (year control removed, catalog-derived constants, badges/chip): shipped. `src/lib/data-catalog/years.ts` throws at module load on a missing catalog entry rather than falling back to a literal; two pytest checks (`test_baci_coverage_matches_the_trade_parquet`, `test_ei_coverage_matches_the_country_year_parquet`) pin the catalog spans to the parquet.
- **T4** (visible headline + "Data behind this result" disclosure): shipped, open by default. The plan expected to update "the byte-pinned importer fixture… deliberately, in this commit" — no such fixture existed; `tests/unit/export/layers-scenario.test.ts` and `tests/unit/scenarios/panel-model.test.ts` were written fresh instead.
- **T5** (framing copy): shipped across README, `layout.tsx`, `Header.tsx`, `llms.txt`, `CITATION.cff` and the intro card, per the recommendation in `docs/superpowers/briefs/2026-09-20-scenario-first-framing.md`.
- **T6** (e2e): shipped. `time.spec.ts` and `year-relevance.spec.ts` removed with the control they tested; `tests/e2e/as-of.spec.ts` added (chip, pinned-year vintage filter, embed case, scenario headline, empty state). Full suite on a production build: 145 passed. The later label-only change (dropping bracketed years from the four intro questions, `9aa8c3c`) shipped without a fresh e2e run, at the maintainer's direction.
- **Deviation — naming.** `src/lib/scenarios/summary.ts`'s `tradeYearPhrase` became `dataYearsPhrase(tradeYear, routes)` partway through T4/T5 once route-share years needed stating alongside the trade year — one function, not two, so a citation and the embed chip can't drift apart.
- **Deviation — attribution.** The "every surface states its vintage" pass (`sectionVintage`, `src/lib/data/section-vintage.ts`) reads LNG terminal/voyage attribution off the `lng_voyages` layer's catalog tag rather than a new constant, so a source-attribution change there flows through automatically.
- **Follow-ups folded in same day, not deferred:** `disruption_route.data_year` (nullable, 73 of 522 rows; `f85c00c`) and the catalog-derived year constants (`8f54601`) were originally candidates for a later pass but landed the same day once T1–T3 made the gap between "published" and "describes" visible in the UI.

**Open items** (also recorded in `docs/superpowers/HANDOFF.md` and CLAUDE.md's Phase status): the maintainer should confirm or reverse several `data_year` judgement calls in `scripts/transform/build_disruption_routing.py` — Malacca's headline reads "2025 route shares" from only 10 of 108 rows dated; `suez_lng`/`bab_el_mandeb_lng` use the EIA article's 2018 traffic vintage though the "98 % LNG" sentence only says "in recent years"; Keystone/Enbridge (2020) and CPC (2023) are document vintages, not measured-flow years; the Argus and Reuters sources behind a few rows were never fetched (paywall). None of this was in scope for T1–T6 and no code changed to address it.
