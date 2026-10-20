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
- [air] [2026-10-04] Marketing analytics is GA4 through Tag Manager (GTM-PT8ZNQ7Z), defined in analytics.yaml; the direct gtag.js snippet goes when the container goes live — the fleet standard, one place to define events
- [mini] [2026-10-15] OpenBB ODP lives in an opt-in uv group `odp` (never in CI's `uv sync --locked`) and `.venv/` is in ESLint's ignores — the group is ~700 MB and installs plotly's minified JS, which exhausted ESLint's heap
- [mini] [2026-10-15] A committed test fixture for a source that is not cleanly redistributable keeps the real shape (columns, codes, names, dates) with invented values — the repo is public; first used for the ODP spike (EIA/IMF prices rest on Refinitiv/Argus, PortWatch on Kpler, JODI states no licence)
- [mini] [2026-10-15] ODP spike merged to main against the spike's own don't-merge recommendation — maintainer's call: as an academic project the map uses the leeway that gives it; provider data still stays out of the repo, and permission to show PortWatch is asked of the IMF
- [mini] [2026-10-15] IMF PortWatch chokepoint transits ship view-only before the IMF answers the permission request — maintainer's call: academic, non-commercial use; attribution as PortWatch asks, never downloadable, never an input to exposure
- [mini] [2026-10-15] PortWatch counts are always shown as AIS-observed lower bounds — ships running with transponders off are not counted, so since March 2026 PortWatch sees far fewer ships through Hormuz than multi-source trackers (Kpler, Vortexa: about 10 vessels a day in September 2026)
- [mini] [2026-10-20] Host on Cloudflare Workers through OpenNext, replacing Vercel — fleet standard (DEV-GUIDELINES web target); the app has no env vars or Marketplace storage, so nothing had to be copied out of Vercel
- [mini] [2026-10-20] The two DuckDB wasm modules (34 and 39 MB) are served same-origin by the Worker from R2 `global-energy-map-assets`, keyed by package version — over Workers' 25 MiB per-asset limit, and a foreign CDN would break the /query 'zero foreign hosts' promise
- [mini] [2026-10-20] The Worker runs first for /data/* and /duckdb/* to set Cache-Control by the presence of `?v=` — next.config headers() never sees asset-store responses and `_headers` cannot match a query string
- [mini] [2026-10-20] OpenNext static-assets incremental cache: every page is prerendered and nothing revalidates; without it OpenNext re-renders per request and the doc pages' fs reads of docs/*.md fail on Workers
- [mini] [2026-10-20] Vercel Web Analytics removed with the port (it cannot run off Vercel); its replacement waits for the maintainer — privacy.md now names Cloudflare as host and Google Analytics as the only analytics
