# How the Global Energy Map was built with coding agents

A case study for people building real software with agents. It is written from the project's own record: git history, PRs, plans, specs and the review document. The numbers below come from that record, not from memory.

## What was built

A public web app for energy researchers. It maps the world's hydrocarbon system (reserves, extraction, pipelines, refineries, LNG terminals and voyages, storage, ports) over 1990–2024 and runs disruption scenarios (Strait of Hormuz for crude and LNG, Druzhba, Baku–Tbilisi–Ceyhan, CPC). Everything is traceable to cited public sources.

- **App:** Next.js 16 / React 19 / TypeScript strict, deck.gl inside MapLibre, DuckDB-WASM querying Parquet in the browser, no backend. About 8,800 lines of TypeScript.
- **Data pipeline:** Python (uv) ingest and transform scripts, about 6,100 lines, producing 12 files (24 MB) under `public/data/` from GEM, NETL, the Energy Institute, CEPII BACI, LNG-T3, OpenStreetMap and Natural Earth. One command (`scripts/build_all.py`) rebuilds everything, and two runs give byte-identical output.
- **Tests:** 374 Vitest unit tests (43 files), 238 pytest tests (18 files, including data-integrity checks over the shipped files), and 67 Playwright end-to-end tests (13 specs). The e2e tests prove rendering with screenshot pixel probes and run an axe accessibility scan.
- **Operations:** GitHub Actions CI (lint, typecheck, unit, Python, e2e), a post-deploy smoke workflow, and Vercel hosting at https://energymap.marain.space.

## Timeline

| When | Phase | Shape of the work |
|---|---|---|
| May 15–17 | 1–5 | Vertical slices, one layer or scenario at a time. Each had a design spec and a step-by-step plan in `docs/superpowers/`, executed by implementer subagents. |
| Sep 9 | 6 | LNG-T3 voyages, BACI-anchored LNG attribution, CI, licences. Shipped as v1.0.0. |
| Sep 10 | Review | A single review agent on a different model read the whole repo and the live site, then wrote a refactor/redesign review with a phased roadmap. |
| Sep 10 | 7 Correctness | 3 parallel tracks: data pipeline, map shell, time/scenarios. PR #16, +3.5k / −0.5k lines. |
| Sep 10 | 8 Consolidation | 3 parallel tracks, then a second wave (e2e reorganisation and dependency sweep). PR #17, +7.5k / −6.4k lines, 137 files. |
| Sep 10 | 9 Product redesign | 4 parallel tracks (information architecture, visual system, methodology/data/share, scenario panel), then a second wave for accessibility and e2e. PR #19, +8.3k / −0.9k lines. |
| Sep 10–11 | 10 Launch hardening | 3 parallel tracks: performance, licensing, observability. PR #20. Then the custom domain. |

Phases 7–10 (about 20,000 changed lines across four PRs) ran in roughly two days of wall-clock time. The human's role was decisions and taste, not typing: approving the roadmap, making the calls the agents surfaced, and reporting what looked wrong in the browser.

## The turning point: a review before more features

After Phase 6 the project looked finished. Every phase had shipped, CI was green, and the code was above average. The next planned phase was more consolidation.

Instead, a fresh agent on a different model was asked to review the repo and propose a plan to refactor and redesign it. It was told to read everything, run the health checks, look at the live site, and separate must-fix from should-do. Its findings, each with file and line evidence:

- **The headline layer had been wrong since Phase 1.** The reserves parser read the Energy Institute sheet's trailing "change %" and "share of world" columns as extra year columns. The choropleth kept the last row, so the default view painted *share of world total* and rendered uniformly grey.
- **The basemap never rendered in production.** MapLibre's container was 0 px tall because unlayered library CSS beat Tailwind v4's layered `absolute`. On a white background the choropleth borders looked like a minimal basemap, so nobody noticed.
- **The newest feature was unreachable.** The year slider stopped at 2020 while the LNG voyage data ran to 2024. Only the e2e tests, which wrote `?year=2023` into the URL by hand, ever exercised it.
- **Scenario colouring was misleading.** Every importer was painted dark red regardless of exposure, and a BACI aggregate code (`S19`, which is really Taiwan) appeared as a country.
- **The pipeline was not reproducible,** and the hand-edited catalog listed a file that did not exist.

The review's diagnosis was one sentence: *each vertical slice was "done" without anyone ever using the product as a researcher would.* Its central recommendation was to fix correctness before adding anything, then consolidate, then redesign for the actual audience, then harden for launch. It also listed seven decisions that belonged to the human, not the agents: going public, data licensing, keeping DuckDB, visual direction, phones, frozen reserves, and scenario-share provenance. The user answered them in two short messages.

**Takeaway:** passing tests and shipped phases are not evidence that the product works. A cross-model review with instructions to *use* the product found defects that six phases of test-driven slices had not.

## How Phases 7–10 ran

Each phase followed the same loop. The [agent playbook](agent-playbook.md) has the reusable version.

1. **Plan.** The orchestrator (the main Claude Code session) wrote a plan to `docs/superpowers/plans/`. It split the work into **tracks with exclusive file ownership** and wrote down the contracts between tracks, for example "Track A exports `useMapView()` with this signature and Track B imports it", or "Track C creates a stub `ShareMenu` first so Track A can mount it".
2. **Parallel implementation.** One subagent per track. Each prompt named the plan section, the files it owned, the files it must not touch, which commands it could run (not `pnpm build`, not the shared dev server), and what to report back. Agents did **not** commit.
3. **Commit and integrate.** As each track reported, the orchestrator reviewed the report, committed that track's files in logical groups with explicit `git add <paths>`, and handled cross-track fallout: a test in one track asserting something another track changed, or a contract gap.
4. **Verify like a user.** The orchestrator built production, opened it in a real browser, and looked at it. This step found things no test caught:
   - "Top refineries at risk" was six copies of the same tiny Myanmar refinery. NETL lists each plant up to three times, which led to a dedup rule and a capacity-at-risk ranking.
   - Port icons blanketed every coastline once rendering moved into MapLibre.
   - Countries importing a few hundred tonnes of LNG were painted 100 % red.
   - The Hormuz scenario applied crude routing shares to LNG, understating UAE exposure (the Fujairah bypass is oil-only).
   - A test asserted the *buggy* behaviour: the NGL pipeline fixture was expected to be excluded, and 187 NGL pipelines had never been drawn.
5. **PR, CI, merge on human approval.** CI ran the full suite on Ubuntu. The human approved each merge to production.

## What the human actually did

- Asked for the review, then answered the decisions it raised in single-word replies ("1. Ok 2. Keep it 3. Light 4. Banner").
- Picked between presented options: basemap provider when CARTO started watermarking tiles, domain, subdomain, and whether to update disputed scenario shares ("Update them").
- Reported a symptom from their own browser ("Selecting only extraction sites doesn't show anything"). It turned out to be the old production build, not the PR, and the flow became an e2e test.
- Granted scoped access when it saved a round trip (a Cloudflare token in a local secrets file for one DNS record).
- Said "keep going" at phase boundaries.

## Numbers worth knowing

- Review: one agent, about 15 minutes, 58 tool calls, a 267-line document that set the next four phases.
- Phases 7–10: **15 parallel implementer tracks** — 13 in first waves (3 + 3 + 4 + 3) and 2 second waves (Phase 8's e2e reorganisation and dependency sweep, Phase 9's accessibility and e2e pass). Integration in each phase was the orchestrator's own work, not a subagent. About 20,000 changed lines across 4 PRs.
- Every phase ended with the full local suite green. CI caught two things local runs did not: an unformatted Python file, and an e2e budget too small for the slower CI runner.
- The data changes were all traceable. Row counts before and after each rebuild went into the commit messages, and disputed numbers (six scenario route shares) were flagged with sources, not changed silently. Only the human's "update them" changed them.

## What we would do differently

- **Do the "use it like a researcher" review after Phase 1, not Phase 6.** The reserves bug and the invisible basemap were Phase 1 defects that every later phase built on.
- **Put a pixel-probe e2e test on the default view from day one.** It would have failed on the grey choropleth and the zero-height basemap immediately.
- **Retarget stacked PRs before merging their base.** See the playbook: GitHub closed the Phase 9 PR when Phase 8's branch was deleted.
