# Session handoff — resume prompt

> **When the maintainer says hello, read this file first, then act on "First thing to do".**
> Last updated: 2026-09-19, end of session. **No agents are running. Every worker branch is merged. The tree is clean.**

You are picking up the orchestration of `docs/superpowers/plans/2026-09-19-post-launch-ux-scenarios.md` on Global Energy Map. Read `CLAUDE.md`, then that plan's **§3 Status** table — it is the ledger of what merged and why.

## 1. Where things stand

- Branch **`post-launch-ux-scenarios`** in the main checkout. **Nothing is pushed.** `main` is 5 commits ahead of `origin/main` (the data-freshness work + an R2 archive note) and this branch sits on top of it. **Pushing `main` deploys production — ask the maintainer first, every time.**
- Merged and reviewed on the branch: Wave 0 fixes; research R1–R4 with independent verification; S0 focus/camera; S1 scenario on the map; S2 BACI trade-flow arcs; S3 country panel; S4 search; S5 engine extensions; S6 seven new scenarios (15 route-share sets across 11 scenarios); S7 embed mode; S8 scheduled-refresh scripts (**not installed**); T1 severity / combine / exporter view; T3 scenario context block; T4 `/query` console; T6 announcement drafts (`docs/announce/`, nothing posted). T5 PMTiles dropped (research said no). **T2 pipeline-gas is HELD** for the maintainer.
- **Final state, verified on a quiet machine after the last merge:** full Playwright suite **139 passed, 0 failed** (15.9 min); 923 Vitest; 306 pytest (9 skipped, network); lint, typecheck and `pnpm build` clean; `disruption_route.parquet` 522 rows, rebuild byte-identical.
- Review ledgers: `docs/superpowers/research/{s5-review-findings,wave2-review-findings,final-review-findings}.md`.

## 2. Nothing is in flight

All three reviews' findings are fixed and merged (`final-review-findings.md` was closed by two fix batches: LNG factor now 15.644 TWh/Mt on a GCV basis; 30-day recency floor on GIE storage; USA dropped from Suez; DEU/UZB/KGZ zeroed on the Turkish Straits; exporter-view CSV; camera key; URL edge cases; docs/README brought in line). Stale agent worktrees under `.claude/worktrees/` can be removed with `git worktree remove` once the maintainer is happy — every branch in them is merged.

If a future session loses running agents: `git worktree list`; in each `agent-*` worktree run `git log --oneline post-launch-ux-scenarios..HEAD` and `git status --short`; commit uncommitted work as a labelled WIP, then start a fresh agent **inside that worktree** with the original brief. That is how T1 and T3 were recovered on 2026-09-19.

## 3. First thing to do

1. Confirm the state: `git status` (clean), `git log --oneline -3`, branch `post-launch-ux-scenarios`.
2. Greet the maintainer with a short status and the decision list in §4 — that list is what blocks shipping; no engineering is outstanding.
3. On their go-ahead: open a PR from `post-launch-ux-scenarios` to `main` (CI runs lint, typecheck, Vitest, build, ruff, pytest and Playwright on ubuntu — watch the scenario-panel specs, which are slow under software WebGL, and `a11y.spec.ts` first-visit, which timed out once under machine load). Merging deploys production.
4. After deploy: `scripts/smoke/run.sh https://energymap.marain.space`, and add `/query` to that smoke script (not done yet).

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
