# Agent playbook: orchestrator plus parallel implementer tracks

The workflow that took this project from a six-phase prototype to a launch-ready product. It is written to be reused; nothing here is specific to maps.

## Roles

- **Human:** owns decisions, taste and access (merges to production, licensing calls, credentials). Answers questions in one line when the options are clear.
- **Orchestrator:** the main agent session. It writes plans, launches and briefs implementers, commits their work, integrates across tracks, runs the full suite, verifies in a real browser, opens PRs, and reports to the human. It keeps the global picture; implementers never need it.
- **Reviewer:** a fresh agent, ideally on a different model, asked to review and plan rather than build. It is used at inflection points.
- **Implementers:** one subagent per track, each with an exclusive file set. They build, test and report. They never commit.

## The loop

### 1. Review before you build more

Ask a fresh agent to review the whole repo *and the running product*, and to produce a phased plan. The prompt that worked here:

- Read everything (source, pipeline, tests, docs, CI), run every health check, and look at the live site.
- Give refactor findings with file:line evidence, and redesign findings aimed at the actual users.
- Classify each finding as must-fix, should-do or defer, and list things *not* to do.
- List the decisions that belong to the human, each with a recommendation.
- Write the result to a spec file and return a summary under 600 words.

Spot-check the headline claims yourself before relaying them. Here, one DuckDB query confirmed the reserves-parsing bug in seconds.

### 2. Surface decisions, then stop asking

Put the human's decisions to them in one message, with recommendations. Record the answers in the spec and in memory, so later agents inherit them, then proceed without re-asking. Only interrupt again for decisions that are new, outward-facing or hard to reverse: merging to production, spending money, changing someone else's data or DNS, licensing.

### 3. Plan with tracks, ownership and contracts

For each phase, write a plan file with:

- **Goal and exit criteria.** Measurable where possible, e.g. "cold scenario load < 5 s", "e2e 0 flaky".
- **Tracks with exclusive file ownership.** List them as a table. Overlap is the main cause of parallel-agent failure.
- **Contracts between tracks.** Exact function names and signatures, which track creates a shared stub first, which props stay stable. Implementers code against the contract, not against each other's work in progress.
- **Per-item approach and verification.** TDD where it pays: data transforms, pure functions, scoring and ranking.
- **Risks.** Include what to do if an assumption fails, e.g. "if interleaved rendering misbehaves, fall back and report".

### 4. Brief implementers precisely

Every implementer prompt said:

- read `CLAUDE.md`, then *this section* of the plan, then *these* findings;
- you own exactly these paths, and these other paths belong to parallel agents;
- **do not commit or stage** (see failure mode 1);
- which commands you may run, and which shared resources you must not touch: the shared `.next` build directory, port 3000, the full e2e suite;
- how to verify (browser, measurements), and to stop and report rather than silently change data if something drifts;
- report back in under N words: changes per item, files grouped by item, deviations, check results, and anything that looks like a product bug.

### 5. Orchestrator commits and integrates

When a track reports, read the report, spot-check the claim that matters most, and commit its files in logical groups with explicit paths. Then handle integration:

- a test in one track asserting the old behaviour another track changed;
- the stale generated artefact: regenerate the catalog *last*, after every data change;
- a contract gap, such as a hydration mismatch in a shared hook, or a server snapshot that differs from the client.

### 6. Verify like a user, on a production build

Build production and open it in a browser. Look at the default view, one flow per mode and one scenario per commodity, and read the numbers. In this project that step found:

- duplicate refineries dominating a ranking;
- icons blanketing coastlines;
- trivial importers painted 100 % red;
- crude routing shares applied to LNG;
- 187 pipelines never drawn.

Unit and e2e tests had covered all of that code.

Turn each finding into a failing test, fix it, and note it in the PR.

### 7. PR, CI, human merge

Open the PR with a summary that a reviewer can check: what changed, the measurements, and the open questions. Wait for CI; the CI runner is slower and less forgiving than a laptop. Merge on the human's approval, then confirm the production deploy with a request that proves the new code is live, such as a new page, a changed row count or a new header.

## Failure modes we hit, and the rule each produced

1. **Staged deletions swept into another track's commit.** An implementer ran `git rm`, which stages the deletion. The orchestrator's next commit, meant for a different track, picked it up. **Rule:** implementers never stage; delete with plain `rm`. The orchestrator commits with explicit paths only, never `git add -A` on a shared tree.
2. **Agents stopping while "waiting".** Implementers started the 15-minute e2e suite in the background and ended their turn saying they would resume on completion. Subagents are not re-woken by background jobs. **Rule:** tell implementers to wait for long jobs in the foreground with an until-loop and timeouts. If one stops anyway, message it to poll and finish.
3. **Shared build directory and ports.** Several agents wanting `pnpm build` or a dev server at once can corrupt each other's `.next` or collide on port 3000. **Rule:** the orchestrator owns `build` and the full e2e run. Implementers get their own port, or a scratch clone or worktree for heavy runs.
4. **Tests that encode the bug.** A fixture expected NGL pipelines to be excluded; another pinned a glyph size that was itself a visual defect. **Rule:** when a fix breaks a test, first ask whether the test was asserting the defect.
5. **Silent data edits.** A reviewer or implementer "fixing" a hand-set number would have changed every scenario result. **Rule:** implementers flag disputed data with sources and leave the value alone. The human decides, and the commit records the old value, the new value and the derivation.
6. **Local green, CI red.** CI failed a Python job on formatting that was never run locally, and an e2e test exceeded its budget on a slower runner. **Rule:** run the exact CI commands locally (`ruff format --check`, `uv sync --locked`, `CI=1` e2e against a production build). Give heavyweight e2e specs their own budget. Re-run once before debugging a CI-only timeout, and debug if it fails twice.
7. **Stacked PRs closed by base-branch deletion.** Merging the Phase 8 PR with `--delete-branch` deleted the branch the Phase 9 PR was based on, so GitHub closed it. After a rebase and force-push it could not be reopened. **Rule:** retarget the dependent PR to `main` *before* merging its base, then rebase with `git rebase --onto origin/main <old-base-tip>`.
8. **"It's broken" reports about the wrong deployment.** The human reported an empty map with only extraction sites selected. That was production running the old code; the PR preview was fine. **Rule:** reproduce on the exact deployment the human used, and state which one you checked.
9. **Reviewer claims taken on trust.** Review findings were right, but one guess about a root cause was only close (the CSS-layer issue). **Rule:** diagnose in the real environment before editing; the plan said "diagnose in the browser before editing" for exactly this reason.

## Artefacts that make this work

- **`CLAUDE.md`:** the living contract. Stack, schema, commands and every convention learned the hard way: panels set their own text colour, deck.gl accessors need `updateTriggers`, never change a data file without regenerating the catalog, and so on. Update it at the end of every phase.
- **Plans in the repo** (`docs/superpowers/plans/`): tracks, ownership, contracts and exit criteria, so any agent can pick up a phase cold.
- **Machine-checked invariants:**
  - data-integrity tests over the shipped files;
  - a schema per Parquet file;
  - byte-identical rebuilds;
  - a catalog with sha256 per file;
  - contrast tests for the palette;
  - axe for accessibility;
  - pixel probes for rendering.

  These let agents change a lot of code quickly without the human re-checking everything.
- **Memory:** decisions and gotchas stored as short facts ("light-only UI", "retarget stacked PRs first"), so the next session does not relitigate them.
