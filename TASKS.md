# Tasks — Global Energy Map

<!-- Format (shared by every brain): one `- [ ]` per task; optional `📅 YYYY-MM-DD` due date and `#tags`.
     Now / Next / Later / Done. Decisions go in DECISIONS.md. Items below come from CLAUDE.md and
     docs/superpowers/HANDOFF.md (2026-09-21). -->

## Now

- [ ] Cloudflare Web Analytics beacon (zone auto-install) loads on energymap from static.cloudflareinsights.com — not in privacy.md: keep it and disclose, or exclude the host (the store token has no RUM permission; dashboard step) #privacy

## Next

- [ ] Await IMF reply on PortWatch + PCPS (sent to copyright@imf.org 2026-10-15); JODI request sent to jodinfo@ief.org 2026-10-15 #data
- [ ] Announce: `docs/announce/` is drafted and re-verified (2026-09-21) but headed "DO NOT PUBLISH YET"; publishing is the maintainer's call #launch
- [ ] Scheduled refresh: run `scripts/refresh/monthly.sh` by hand once, then load `scripts/refresh/space.marain.energymap.refresh.plist` into launchd (see `docs/refresh.md`) #data
- [ ] Data-year judgement calls in `scripts/transform/build_disruption_routing.py` (Malacca headline year, Suez/Bab el-Mandeb LNG 2018 vintage, Keystone/Enbridge/CPC vintages, Argus/Reuters rows inferred): confirm or reverse each #data

## Later

- [ ] Kirkuk–Ceyhan: held; needs a year-bounded share (pipeline shut 2023-03 to 2025-09) and the shipped Hormuz IRQ share moved 0.90 → 0.87 in the same commit #data
- [ ] Inbound Hormuz exposure (needs an importer-wide route wildcard)
- [ ] Pipelines as PMTiles
- [ ] Daily-throughput tooltip, and a vintage filter on scenario inputs (both deferred at Phase 8)
- [ ] Coal sector (GEM mines and plants) and cross-commodity scenarios #data
- [ ] Tankers / AIS: its own brainstorm; sourcing is the gating decision (`docs/research/2026-05-19-tanker-ais-sources.md`) #data

## Done

- [x] Vercel project global-energy-map deleted (2026-10-21, Narendra); the team-level marain.space domain stays for the marain project
- [x] Cloudflare cutover (2026-10-21): energymap.marain.space is a Worker custom domain; deploy.yml on push to main, smoke green on the live host, https-check ok (the Worker 301s http)
- [x] GA4 + Tag Manager live: container GTM-PT8ZNQ7Z published (gtm.js served, checked 2026-10-20); snippet in layout.tsx, production host only
- [x] EIA API key: already in the sops store as `env.eia_api_key` (confirmed by name 2026-10-15)
- [x] Chokepoint traffic context (2026-10-15): IMF PortWatch daily transits, direct ingest, view-only in the scenario panel's Context block — shipped before the IMF replied, at the maintainer's call
- [x] Announcement Hormuz sentence (2026-10-15): cites CRS R45281 and EIA STEO Aug 2026; says "strikes", not "invasion" (no source found for a ground invasion)
- [x] ODP spike (2026-10-15): merged to main at the maintainer's call — code and synthetic fixture only, no provider data (`docs/02-odp-energy-context-spike.md`)
- [x] GA4 + Tag Manager set up from analytics.yaml (2026-10-04): container GTM-PT8ZNQ7Z, version 2 saved and not published; site code on branch analytics-gtm

- [x] Brain brought to the claude-computer standard (2026-10-04): TASKS.md, DECISIONS.md, justfile, .editorconfig, `docs/` index and overview, fleet pointer in CLAUDE.md
