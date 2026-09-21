# Brief: is this a time machine or a dependency model?

> For a Fable agent. Written 2026-09-20 by the Opus session that shipped the day's three deploys.
> **Read `CLAUDE.md` first**, then this. Read-only until you have a recommendation; the ask is a
> design judgement, not an implementation ticket.

## 1. Where the project is, as of this handoff

Everything below is **live at https://energymap.marain.space** on `main`.

| Deploy | What |
|---|---|
| `3773156` | The 168-commit post-launch branch: focus/camera, BACI trade-flow arcs, country panel, search, embed mode, severity / combined scenarios / exporter view, the `/query` console. Plus the two freshness layers (EIA shale, UN Comtrade recent imports) that had been sitting unpushed on `main`. |
| `1213c2e` | Smoke fix: the DuckDB bundle check now verifies WASM magic bytes via a ranged GET. The earlier `content-length` assertion failed on a healthy site because Vercel serves the bundle Brotli-compressed and omits the header. |
| `36dcd9c` | Year control collapses when idle; intro card states how current the data is. |

**In flight, not merged:** branch `kaz-deu-partial-share` (`8fff8e0`) — the Turkish Straits
KAZ→DEU row restored at 0.53 as a maintainer-directed interim, annotated in its own `source_note`
as an estimate. Full e2e was running when this brief was written. `disruption_route` 522 rows.

**Verification standard in use:** the full Playwright suite runs against a **production** build
(`pnpm build && CI=1 pnpm exec playwright test`), not `next dev` — the previous session's 139/139
was a dev run, and `/query`'s dynamic import, the embed headers and the no-DuckDB-on-`/` guard are
exactly what differs between the two bundles. Keep that standard.

**Held for the maintainer, untouched:** the announcement drafts (`docs/announce/`, still headed
DO-NOT-PUBLISH), the launchd refresh plist (run `monthly.sh` by hand once first — it has never
completed end to end), and Kirkuk–Ceyhan.

Housekeeping done: the 17 stale agent worktrees are removed and their branches deleted (21 GB).

## 2. The ask

The maintainer, looking at this line in the first-run intro card:

> Slide through time, 1990–2024 — the badges in the Layers panel say which layers respond.

said: *"This, and other things, make it look like the focus of this project on time more than
scenario analysis."*

**Work out whether the product's framing has drifted away from what it is actually for, and if so
propose the re-framing.** The question is about hierarchy and first impressions, not features.
Nothing here is a request to delete time-related functionality.

## 3. My perspective

**I think the maintainer is right, and I think I can name the cause.**

The project grew one data source at a time — Phases 1 through 10, then a freshness track, each
adding a layer. Time is the one axis every source shares, so it became the organising spine by
accretion rather than by decision. Scenarios arrived as a *mode* inside that structure instead of
as the frame around it. Nobody chose the current hierarchy; it is the residue of the build order.

The evidence is consistent, and it is in the framing surfaces rather than the engine:

- **The README leads with inventory and puts scenarios in the second sentence.** "An interactive
  map of the world's oil and gas system: reserves, extraction, pipelines, refineries, LNG
  terminals and voyages, storage and ports, 1990–2024. It includes disruption scenarios that show
  who is exposed…" The date range is in the first sentence; the differentiator is an afterthought.
- **The meta description does the same** (`src/app/layout.tsx:22`): "…map of the world's oil and
  gas system — reserves, extraction, pipelines, refining, LNG and trade — **with** chokepoint
  disruption scenarios." A trailing clause.
- **The default mode is `infrastructure`** (`src/lib/modes/index.ts:22`), so a bare link opens on
  a browsable inventory, not on a question. `DEFAULT_YEAR` is 2020 — chosen because it is the last
  live reserves year, which is a data-availability reason, not an analytical one.
- **The intro card's bullets run: Hover, Slide through time, Pick a disruption, Search.** The
  scenario — the thing nothing else on the public web does — is third of four, behind two
  map-browsing behaviours.
- **The year slider is the most prominent persistent chrome on the map**, bottom-centre
  (`YearSlider.tsx:118`), while the scenario lives in a side panel.
- Every layer carries a `time:` badge; `/methodology` has a generated "How current each layer is"
  section; `?year=` is in every URL.

**The counter-argument, which I hold too.** Time is not decoration here. Scenario exposure
genuinely varies by year — the engine is year-parameterised (`engine.ts:92`), and "who loses most
if Hormuz closes" has a materially different answer in 1995 and 2024. The vintage honesty (badges,
coverage spans, the "old" marker) is a real differentiator for the research audience and should
not be softened. **So the fix is not to suppress time. It is to subordinate it** — time should
read as a *parameter of the question being asked*, not as a peer feature competing with it.

**A tension I introduced today, which you should weigh rather than inherit.** In the same session
I made two changes that pull in opposite directions: the year slider now *collapses* when nothing
on screen reads it (less time salience), and the intro card gained a boxed "How current the data
is" block listing four data end-dates (more time salience). The second was the right fix for a
real complaint — the old copy implied the map held no data after 2024, when four layers run past
it — but it plausibly compounded the very impression the maintainer is now describing. Treat that
block as in scope for redesign, not as settled.

**Where I would look first**, though the recommendation is yours to make: the lead copy (README,
meta description, intro card) is cheap to change and carries most of the first impression; the
default mode is a single constant but changes what every bare link does; and the framing of the
year as "as of 2024" attached to a scenario reads very differently from a global timeline, at
roughly the same implementation cost.

## 4. What to produce

A short written recommendation — not a patch — covering:

1. **Verdict**, with evidence: has the framing drifted, and how far? Say so plainly if you think
   the maintainer and I are overstating it; that is a useful answer.
2. **The re-framing**, concretely: what the lead sentence should say, what a first-time visitor
   should see, and where time belongs in that hierarchy.
3. **The default-mode question**, costed: should a bare `/` open on Scenarios? What breaks — bare
   links, the `data-ready` signal, the a11y focus-order test, e2e specs keyed on
   `data-mode="infrastructure"`?
4. **What the "How current the data is" block should become**, given it is one day old and solves
   a real problem.
5. **Ordered smallest-to-largest**, so the maintainer can take the copy changes alone and stop.

## 5. Constraints

- **Old shared links must render unchanged.** This is the codebase's firmest rule. A default-mode
  change is the one thing in scope that can silently violate it — a bare `/?year=2010` link means
  what the *current* default makes it mean.
- **Do not delete time functionality.** Vintage filtering, coverage badges and the year axis are
  load-bearing for the research audience and for the scenario engine itself.
- **Symbology, catalog and relevance rules stay single-source.** Colour lives in `src/lib/symbology/`,
  data facts in `catalog.json`, and "does the year matter now" in `src/lib/time/relevance.ts`. A
  re-framing must not introduce a second hand-kept copy of any of them.
- Read-only. Cite `file:line`. No commits.
