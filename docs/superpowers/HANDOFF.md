# Session handoff — resume prompt

> **When the maintainer says hello, read this file first, then act on "First thing to do".**
> Last updated: 2026-09-21, end of session. **No agents are running. `main` is clean and matches `origin/main`.**

## 1. Where things stand

- Everything is on **`main`** and **live at https://energymap.marain.space**. The `post-launch-ux-scenarios` branch this file used to track landed on 2026-09-20; the most recent work (2026-09-21, `97c0688`…`9aa8c3c`) dropped the year slider from the UI and led every surface with the scenario question instead of the asset inventory — see `docs/superpowers/plans/2026-09-21-drop-year-slider.md` (now has an Outcome section) and `docs/history.md`'s last entry.
- Three branches from the earlier push (`kaz-deu-partial-share`, `post-launch-ux-scenarios`, `year-control-and-coverage`) are stale local checkouts — `git branch --merged main` confirms all three are fully merged. Safe to delete locally whenever the maintainer wants (`git branch -d <name>`); nothing to recover from them.
- Version 1.1.0 everywhere it's quoted (`package.json`, `CITATION.cff`, README, researcher docs, `llms.txt`). Catalog version 7.
- Verification standard: full Playwright suite on a production build was **145 passed** for the vintage-disclosure work (`97c0688`…`f85c00c`); the final commit (`9aa8c3c`, dropping bracketed years from the four intro-card example questions) is a label-only change that shipped **without a fresh e2e run**, at the maintainer's direction — worth a spot-check next time the suite runs for any other reason.

## 2. Nothing is in flight

No agents running, no open PRs, no uncommitted work. `git status --short` is clean.

## 3. First thing to do

There is no forced next step. Likely next actions, roughly in order of how blocking they are:

1. **Announce.** `docs/announce/` (announcement, fact-check, outreach email, short posts) is drafted and re-verified against current data (2026-09-21) but still headed "DO NOT PUBLISH YET" — publishing is the maintainer's call. Before it goes out: the announcement's claim that Hormuz was effectively closed 2026-02-28 to 2026-04-07 has **no citation in the repo** (candidate: CRS R45281) — find and cite it, or cut the claim.
2. **Scheduled refresh.** `scripts/refresh/monthly.sh` + `scripts/refresh/space.marain.energymap.refresh.plist` exist and are documented (`docs/refresh.md`) but the plist has never been loaded into launchd. Run `monthly.sh` by hand once first to confirm it works end to end before installing the plist.
3. **Data-year judgement calls.** `disruption_route.data_year` (shipped 2026-09-21) is deliberately NULL except where a document states a year — but a few rows are judgement calls the maintainer should confirm or reverse, each a one-line change in `scripts/transform/build_disruption_routing.py`:
   - Malacca's scenario headline currently reads as "2025 route shares" from only 10 of 108 rows actually dated that year.
   - `suez_lng` / `bab_el_mandeb_lng` use the EIA article's 2018 traffic vintage as their data year, though the underlying "98% of LNG" sentence only says "in recent years" — arguably should be NULL instead.
   - Keystone, Enbridge Mainline (2020) and CPC (2023) use each document's general data vintage, because the share sentences themselves carry no year.
   - A few rows cite Argus and Reuters sources that were never fetched (paywalled) — their data years are inferred, not read off the document.
4. **Kirkuk–Ceyhan.** Held — would need a year-bounded share (pipeline shut 2023-03 to 2025-09) and moving the shipped Hormuz IRQ share 0.90 → 0.87 in the same commit. Not started.

## 4. Decisions the maintainer has already made (don't re-litigate)

- Going public: done (custom domain, analytics, downloads scoped to open licences).
- Light-only UI: decided 2026-09-10, no dark theme.
- DuckDB-WASM: kept, off the map's load path, used only by `/query`.
- Year slider: removed 2026-09-21; `AppState.year`/`year=` stay for shareable pinned links.
- Scenario-first framing: adopted 2026-09-21 per `docs/superpowers/briefs/2026-09-21-scenario-first-framing-recommendation.md` (brief: `docs/superpowers/briefs/2026-09-20-scenario-first-framing.md`).

## 5. Working rules that cost us time when ignored

- Workers run Playwright on a private port, **one spec file per invocation, foreground, with `--global-timeout`** (`E2E_PORT=31xx`). A background run polled from a sleep loop once hung for 3.5 h and kept other agents alive.
- Never trust an unrun spec, and never trust a research figure that has not been through an independent verifier — three review passes on the post-launch UX work found 22 wrong and 23 misapplied figures between them.
- `.claude/worktrees/` is excluded from eslint, tsc and git; merge worktree branches, don't copy files.
- Stage explicit paths. No `git add -A` on the shared tree.
- Pushing `main` deploys production — ask the maintainer first, every time.
