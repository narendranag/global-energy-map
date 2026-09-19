# Session handoff — resume prompt

> **When the maintainer says hello, read this file first, then act on "First thing to do".**
> Last updated: 2026-09-19 (DRAFT — two fix agents still running when this was written; see §2).

You are picking up the orchestration of `docs/superpowers/plans/2026-09-19-post-launch-ux-scenarios.md` on Global Energy Map. Read `CLAUDE.md`, then that plan's **§3 Status** table — it is the ledger of what merged and why.

## 1. Where things stand

- Branch **`post-launch-ux-scenarios`** in the main checkout. **Nothing is pushed.** `main` is 5 commits ahead of `origin/main` (the data-freshness work + an R2 archive note) and this branch sits on top of it. **Pushing `main` deploys production — ask the maintainer first, every time.**
- Merged and reviewed on the branch: Wave 0 fixes; research R1–R4 with independent verification; S0 focus/camera; S1 scenario on the map; S2 BACI trade-flow arcs; S3 country panel; S4 search; S5 engine extensions; S6 seven new scenarios (15 route-share sets across 11 scenarios); S7 embed mode; S8 scheduled-refresh scripts (**not installed**); T1 severity / combine / exporter view; T3 scenario context block; T4 `/query` console; T6 announcement drafts (`docs/announce/`, nothing posted). T5 PMTiles dropped (research said no). **T2 pipeline-gas is HELD** for the maintainer.
- Last full e2e on the merged branch: 137 passed, 2 failed (one spec locator, fixed in `8695579`; one axe timeout under machine load, passes alone). Unit: 859 Vitest, 306 pytest, lint/typecheck/build clean at that point.
- Review ledgers: `docs/superpowers/research/{s5-review-findings,wave2-review-findings,final-review-findings}.md`.

## 2. In flight when this was written

Two fix agents for `final-review-findings.md`, each in its own worktree under `.claude/worktrees/` (branches `worktree-agent-*`):
- **Fixes A (Sonnet)** — findings 1, 2, 5, 6, 7, 8, 10, 13, 16, 17: LNG factor (14.447 is LHV; ~15.64 TWh/Mt GCV), 30-day recency floor on GIE storage (GBR's last day is 2020-12-30), Suez description, **drop USA from Suez**, Turkish Straits share-0 pairs, Bab el-Mandeb note, researcher docs + README, announcement (2026 Hormuz-closure sentence), search perf test.
- **Fixes B (Opus)** — findings 3, 4, 9, 11, 12, 14, 15, 18–20: exporter-view CSV, combined-scenario camera key, exporter-view labelling, embed chip, country-panel note, `goToAsset` padding, hover leak, `sev`/`view` decoding, stuck-pending guard.

If a session ended before they reported: `git worktree list`; in each newest `agent-*` worktree run `git log --oneline post-launch-ux-scenarios..HEAD` and `git status --short`. Commit any uncommitted work as a labelled WIP, then start a fresh agent **inside that worktree** with the original brief (the findings file is the brief) — that is how T1/T3 were recovered.

## 3. First thing to do

1. Check §2's two branches; merge each with `git merge --no-ff` (expect small conflicts in `ScenarioPanel.tsx`, `CLAUDE.md`; keep both sides).
2. Gates: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; `uv run python -m pytest tests/python -q`; if `public/data/` moved, rerun `uv run python -m scripts.build_all --from build_catalog` and confirm byte-identical.
3. Full e2e on a quiet machine: `pnpm exec playwright test --global-timeout=3000000`.
4. Update the plan's status table, then give the maintainer the decision list in §4.

## 4. Decisions waiting for the maintainer

1. **New scenario shares** (S6) are editorial — approve before they reach `main`. Includes two orchestrator calls to confirm or reverse: USA dropped from Suez; Turkish Straits zero pairs.
2. **Kirkuk–Ceyhan** would need the shipped Hormuz IRQ share moved 0.90 → 0.87. Held.
3. **Pipeline gas (T2)**: BACI unusable; Eurostat works for Europe but has the same hub problem and Austria/Moldova attribute no origin. Ship a partial Ukraine-transit scenario, or not?
4. **Scenario camera never fits on load** (S1 agent's strengthening of the brief) — keep or relax.
5. **`/query` posture**: every table queryable on screen; only export is licence-gated.
6. **Exporter view** reuses the 0.1 %-of-world floor, so small high-share exporters are omitted.
7. **Rename `production_crude_kbpd`** (it is total liquids) at the next EI refresh — breaks saved `?q=` links.
8. **Scheduled refresh**: loading the launchd plist is the maintainer's action; first real run is untested end to end.
9. **Announcement**: drafts only; must carry the 2026 Hormuz-closure sentence before publishing.
10. Push `main` / open the PR.

## 5. Working rules that cost us time when ignored

- Workers run Playwright on a private port, **one spec file per invocation, foreground, with `--global-timeout`** (`E2E_PORT=31xx`). A background run polled from a sleep loop hung for 3.5 h and kept other agents alive.
- A finished agent that keeps re-notifying has a leftover background waiter — check its worktree is clean and merged, then `TaskStop` it.
- Never trust an unrun spec, and never trust a research figure that has not been through an independent verifier: across three notes the verifiers found 22 wrong and 23 misapplied figures.
- `.claude/worktrees/` is excluded from eslint, tsc and git; merge worktree branches, don't copy files.
- Stage explicit paths. No `git add -A` on the shared tree.
