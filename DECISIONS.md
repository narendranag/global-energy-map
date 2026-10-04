# Decisions — Global Energy Map

Append-only. Format: `- [<host>] [YYYY-MM-DD] <decision> — <why>`.

## Carried over (no dates recorded)

These were recorded in `CLAUDE.md` and `docs/superpowers/HANDOFF.md` before this file existed. Don't re-ask them.

- **Going public:** done, with a custom domain, analytics, and downloads scoped to openly licensed files.
- **Light-only UI:** no dark theme.
- **DuckDB-WASM:** kept, off the map's load path, used only by `/query`.
- **Year slider:** removed; `AppState.year` and `year=` stay for shareable pinned links.
- **Scenario-first framing:** the map leads with "who loses supply when a chokepoint closes or a pipeline is cut?".
- **Paid data:** ruled out for now on redistribution-licence grounds, not cost (`docs/commercial-data-options.md`).

## Since

- [air] [2026-10-04] This brain follows the claude-computer standard (DEV-GUIDELINES: TASKS.md, DECISIONS.md, justfile, docs/) — one convention across every project
- [air] [2026-10-04] Existing guides under `docs/` keep their paths and carry no front matter; only `docs/README.md`, `docs/01-overview.md` and `docs/AGENTS.md` are in the documentation standard — the app (`docs/methodology.md`, `docs/legal/*.md` rendered at build time), e2e tests, source comments, `public/llms.txt` and GitHub links point at those paths
- [air] [2026-10-04] `just lint` mirrors CI (eslint, tsc, ruff check and format, plus `docs-build --check docs`) and `just test` runs Vitest and the Python tests; e2e stays `pnpm test:e2e` — it needs a production build and a browser
