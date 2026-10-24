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
- [mini] [2026-10-21] Repo secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID set on narendranag/global-energy-map from the store with `deploy-secrets` (by the claude-computer session) — pre-approved for the owner's own repos; deploy.yml can now run once it is on main
- [mini] [2026-10-21] Cut energymap.marain.space over to the Cloudflare Worker (Narendra: "Yes. Cut over") — Vercel's A record (76.76.21.21, DNS-only) deleted and the hostname attached as a Worker custom domain through the API (the custom-domain override does not apply to an external record); rollback is deleting the custom domain and recreating that A record
- [mini] [2026-10-21] Plain http is redirected (301) by the Worker for this hostname, not by the zone's Always Use HTTPS — that setting is zone-wide and is the owner's call; hashed /_next/static files are served before the Worker and still answer on http
- [mini] [2026-10-21] The Vercel project stays as a fallback and for the global-energy-map-one.vercel.app redirect — deleting it is a separate yes
- [mini] [2026-10-21] TTFB from mini is ~0.45 s on Cloudflare vs ~0.18 s on Vercel (bom1): Workers traffic from India is served from MRS while Cloudflare's ordinary colo here is DEL; accepted with the cutover
- [mini] [2026-10-21] Deleted the Vercel project global-energy-map and its deployments (Narendra: "Delete it fully", told that global-energy-map-one.vercel.app links would break and the name could be taken) — the Worker is the only host; the next.config redirect for that host went with it
- [mini] [2026-10-21] Keep the Cloudflare Web Analytics beacon (zone auto-install) as the cookieless replacement for Vercel Web Analytics, disclosed in privacy.md — Narendra; verified it reports the page address without the query string, so /query SQL is never sent
- [mini] [2026-10-24] Route shares can be year-bounded (`valid_from_year` / `valid_to_year`, inclusive, NULL = open) and Kirkuk-Ceyhan ships as the 12th scenario, with Hormuz's Iraq share split to match (0.87 through 2022, 1.00 for 2023–2025, 0.88 from 2026) — Narendra: "Go ahead with Kirkuk–Ceyhan, year-split defaults"; a route that shut inside the years we hold made one blended number wrong in every year
- [mini] [2026-10-24] A route's year counts in the regime it spent most of: Kirkuk-Ceyhan stopped 25 Mar 2023 and Kurdish exports restarted 27 Sep 2025, so 2023–2025 are its shut years and the restart regime starts in 2026 — the plan's "~0.07 from 2025" rested on a TRT article that turned out to be the federal line's March 2026 reopening, not the Sept 2025 restart
- [mini] [2026-10-24] Turkish Straits KAZ→DEU's 0.53 estimate holds from 2023 only; earlier years fall back to the 0.80 KAZ wildcard — what the row's own note always said the pre-2023 years should read
- [mini] [2026-10-24] The restart share (0.12 from 2026) is shipped though no trade year reaches 2026 yet, marked low confidence — leaving the window empty would make the scenario silently cut nothing once BACI 2026 lands
