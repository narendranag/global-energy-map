# Recommendation: scenario-first framing

> Answer to `2026-09-20-scenario-first-framing.md`. Written 2026-09-21 (Fable, with Haiku / Sonnet /
> Opus research agents). Read-only: nothing in the repo was changed and nothing committed.

## 1. Verdict

**The framing has drifted, but the brief misnames what it drifted toward.** Time is the
runner-up. The product leads with **inventory**; "1990–2024" rides along as the inventory's suffix;
the scenario is a trailing clause. And the engine, the panel and the URL model are fine — this is a
problem of lead copy and of one missing sentence, not of structure.

Evidence, from an audit of 19 product-describing surfaces:

- **Zero of 19 lead with the scenario.** 11 lead with the asset list, 5 with time or asset-list-plus-
  date-range, 3 are neutral. `README.md:3`, `public/llms.txt:3`, `src/app/layout.tsx:21-23`,
  `Header.tsx:29-31` ("…searchable, queryable, 1990–2024"), every short post in
  `docs/announce/short-posts.md` and `outreach-email.md:11` share one shape:
  *map of [inventory], [date range], with/plus scenarios*.
- `CITATION.cff:17-21` — the text that lands in people's bibliographies — does not mention
  scenarios at all.
- The one surface that gets it right is unpublished: `docs/announce/announcement.md` is headed "an
  inspectable model of who depends on what" and states the question outright — *"when a piece of
  energy infrastructure stops working, whose imports actually run through it, and by how much?"*
  The right lead sentence already exists; it is just not used anywhere live.
- On screen, the asymmetry is one of **headline treatment**. Time has the only boxed block on the
  intro card (`IntroCard.tsx:148-174`, ~40 % of the card body), the only persistent bottom-centre
  control (`YearSlider.tsx:118`), about fifteen badge strings in the Layers panel, and the tagline's
  closing words. The scenario, once picked, produces **no visible sentence stating the answer**: the
  well-formed headline the panel composes ("Hormuz, 2024: 14 importers exposed; most exposed…",
  `ScenarioPanel.tsx:320-327`) is rendered `sr-only` (`:363`). A sighted visitor gets a dropdown and
  two ranked lists. Before picking, the panel is a bare `<select>` reading "None" — every other block
  is gated on `def &&`.

Where the maintainer and the brief overstate it: this is not a time machine. Two of the four example
chips are scenarios and come first; the scenario owns a full right-hand panel; the slider already
collapses when idle; and the time badges are honesty, not emphasis — they are what lets a researcher
trust the scenario number. None of that should be softened. Roughly: the first-impression claim is
right, the structural claim is not.

A side finding worth fixing regardless: `public/llms.txt:3`, `docs/researchers/README.md:9-14` and
the announce drafts still enumerate **five** scenarios (Hormuz ×2, Druzhba, BTC, CPC). There are
eleven. The copy is not just mis-ordered, it is stale — a hand-kept list of the kind the codebase
otherwise refuses to keep. When rewriting, either generate the list from `SCENARIOS` or stop
enumerating.

## 2. The re-framing

**One sentence, used everywhere:** the product is a *dependency model you can interrogate*, the map
is its evidence, and the year is a parameter of the question.

> **Who loses supply when a chokepoint closes or a pipeline is cut?** An open, inspectable model of
> oil and gas dependency: pick a disruption and a year, and see which importers, exporters,
> refineries and LNG terminals are exposed, by how much, and from which source — over a map of the
> infrastructure and trade it is computed from.

Question first; "inspectable" second (the research audience's reason to believe it); inventory last,
recast as *the evidence*; the date range is gone from the lead and reappears as "a year".

**What a first-time visitor should see**, in order: the question; two or three disruptions they can
run with one click; after the click, a visible sentence that states the answer *with its year in
it* — "Strait of Hormuz, as of 2024: 14 importers exposed…". Then the map as the place to check the
answer.

**Where time belongs:** inside the answer, as "as of 2024", and on the control as "Scenario year"
while a scenario is active. The slider, the badges, the vintage disclosure and `?year=` all stay
exactly as they are. Time stops being a peer of the question and becomes one of its arguments —
which is also simply what `engine.ts` says it is.

## 3. The default-mode question: don't

**Should a bare `/` open on Scenarios? No — not because of links, but because of what it opens
onto.**

The link risk is smaller than the brief feared. `encodeAppState` writes `mode=` and `layers=`
unconditionally (`src/lib/url-state/encode.ts:138,158`), so every link the app has generated since
Phase 9 — ShareMenu, the debounced `replaceState`, embed snippets, every worked example in
`docs/researchers/` — pins itself. What would change meaning is only a link with **no** `mode=`:
pre-Phase-9 links and hand-typed ones (`/?year=2010`, `/?focus=SAU`). Note `layers=` does *not* pin
the mode: such a link keeps its drawn layers but would flip tab, panel and `data-mode`. That class is
narrow but it is precisely the class the codebase's two explicit compatibility-contract tests exist
to protect (`tests/unit/url-state/encode.test.ts:307-323`, "an old (pre-mode) URL decodes exactly as
encoded"; `tests/e2e/modes.spec.ts:132-144`). Flipping the constant means rewriting the contract, not
updating a fixture.

What breaks, costed:

| | Flip `DEFAULT_MODE` (A) | Bare-URL-only default (B) | Keep default, scenario-first entry (C) |
|---|---|---|---|
| Code | 1 constant (`modes/index.ts:22`) | new third rule in `decodeAppState` (`encode.ts:170-177`) | intro card + panel copy |
| Old links | pre-mode / hand-typed links flip | only literal `/` changes; but "any param ⇒ legacy" is a guess about intent | none |
| Tests | ~9 direct `data-mode`/default assertions (`map.spec.ts:65-88`, `modes.spec.ts`, `url.spec.ts:29,119`, `encode.test.ts`, `modes.test.ts:167-182`) + 4–6 fixture files to audit | same set, for the bare case, plus new tests for the new rule | `intro-card.test.ts` at most |
| `data-ready` / perf | unaffected — no scenario selected ⇒ no BACI/asset load; preset is one layer lighter | same | same |
| a11y focus order | DOM order unchanged; axe now scans an empty picker | same | unchanged |
| `?embed=1` | **regresses**: an empty "Scenario: None" chip over the map, and embed hides the tabs, so no way out | same for bare embed | unchanged |

The decisive cost is not in the table's test row. **Scenarios mode with nothing selected is the
emptiest screen in the product** — a lone dropdown. A is a worse first impression than today unless
the empty state is redesigned first; and once the empty state and the intro card both lead with a
runnable question, a bare `/` is already scenario-first in experience, and the constant no longer
matters. C uses machinery that already exists and is already tested: the intro card shows only on a
state-less URL (`IntroCard.tsx:25-29`), and its example chips go through `applyMode`, the sanctioned
way to change mode — on a user action, never on decode.

If the maintainer still wants it later, do it as B, only after steps 1–5 below have shipped, and
with sign-off on the contract tests by name. I would not.

## 4. The "How current the data is" block

Keep the fact, lose the altitude. The block is correctly built — its four dates are derived from
catalog `coverage` via `coverageHorizon` (`IntroCard.tsx:17`, `src/lib/data/vintage.ts:205-231`), and
it already links to the generated `/methodology#how-current-each-layer-is` table, which is the single
source of truth. The problem is only that it is the one *boxed* element on a card whose job is to say
what the product is for. It answers "is this stale?" at the volume of "what is this?".

It should become **one unboxed line, still fully derived**, placed after the example questions:

> Scenarios run on reconciled trade through {timeline.through}; {beyond.length} layers carry newer
> data, to {latest beyond date}. [How current each layer is →](/methodology#how-current-each-layer-is)

This still kills the original complaint (nobody will think the map ends at 2024), reframes 2024 as
*the scenario's* horizon rather than the map's, and the per-layer detail stays where it already
lives: the Layers panel's "Data vintage" disclosure and `/methodology`. One test changes:
`tests/e2e/modes.spec.ts:176-189` asserts the two layer names inside `intro-coverage` — keep the
testid and the href assertion, assert the count/date instead.

## 5. The changes, smallest to largest

Steps 1–3 are copy only. **The maintainer can take 1–3 and stop**; that removes most of the
inventory-and-time-first impression. Step 4 is the one that actually re-centres the product.

1. **Lead copy.** `README.md:3`, `src/app/layout.tsx:21-23` (+ OG), `Header.tsx:29-31`,
   `public/llms.txt:3`, `CITATION.cff` abstract → the sentence in §2, cut to fit. Header tagline:
   *"Who loses supply when a chokepoint closes — over the world's oil & gas infrastructure and
   trade."* Drop "1990–2024" from every lead. Fix the five-vs-eleven scenario lists in the same
   pass. No test asserts any of these strings. The held `docs/announce/` drafts should get the same
   treatment before they are ever published, but they are the maintainer's.
2. **Intro-card bullets** (`IntroCard.tsx:128-147`): scenario first, year second *as its parameter*,
   then hover, then search:
   - **Ask a disruption question** — close Hormuz, cut Druzhba, throttle a route to 40 %: see which
     importers, exporters, refineries and LNG terminals are exposed, and by how much.
   - **Choose the year it is asked in**, {from}–{through} — exposure in 2024 is a different answer
     from 1995. Badges in the Layers panel say which layers follow the year.
   - **Hover** … / **Search** … (unchanged).

   Consider moving "Try a question" above the bullets: a runnable question beats a description of
   one. Years still come from `HORIZON`. No test asserts bullet text.
3. **Currency block → one derived line** (§4). One e2e assertion changes.
4. **Show the answer.** Promote the `sr-only` announcement (`ScenarioPanel.tsx:320-327,363`) to a
   visible headline at the top of the panel, year rendered as "as of 2024". Strings already exist;
   keep `data-testid="scenario-announcement"` and `aria-live` on the visible node
   (`a11y.spec.ts:127-128` and `scenarios.spec.ts:172` then pass unchanged). Check the embed chip and
   ShareMenu summary still read naturally beside it — they prepend the year themselves
   (`summary.ts:45-53` deliberately carries none), so nothing is duplicated.
5. **Give Scenarios mode an empty state.** With no scenario picked, show the question and the
   scenario example chips inside the panel instead of a bare "None" `<select>`. Reuse
   `EXAMPLE_QUESTIONS` filtered to `mode === "scenarios"` — one list, two readers. Hidden under
   `?embed=1`, like other new chrome. This is also the prerequisite for ever revisiting §3.
6. **"Scenario year" on the slider** while a scenario drives it. The decision must stay in
   `src/lib/time/relevance.ts` — widen `YearRelevance` to `"scenario" | "active" | "idle"` rather
   than re-deriving "is a scenario active" in the component. Keep the accessible name starting
   "Year" (`a11y.spec.ts:114` matches `/^Year/`) and change only the visible caption.
7. **Optional, after 4 and 6:** make the "as of 2024" chip a button that opens the year control.
   `openedByHand` is local to `YearSlider` (`:47`), so this needs a small module-store seam in the
   style of `scenarios/hover.ts`. Nice, not necessary.
8. **Default mode:** not recommended (§3).

Constraints check: no step touches decode, so old links are untouched; no time functionality is
removed; every date on screen still comes from the catalog, every "does the year matter" decision
from `relevance.ts`, and the only new list reuse (`EXAMPLE_QUESTIONS`) removes a potential copy
rather than adding one. Verification for 3–6 stays the production-build Playwright run.
