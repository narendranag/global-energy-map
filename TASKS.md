# Tasks — Global Energy Map

<!-- Format (shared by every brain): one `- [ ]` per task; optional `📅 YYYY-MM-DD` due date and `#tags`.
     Now / Next / Later / Done. Decisions go in DECISIONS.md. Items below come from CLAUDE.md and
     docs/superpowers/HANDOFF.md (2026-09-21). -->

## Now

- [ ] **Take GA4 + Tag Manager live** — follow docs/HANDOFF-2026-10-04-analytics.md (branch analytics-gtm): consent, Preview, merge, deploy, publish (ask Narendra) #analytics

## Next

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
- [ ] EIA API key: add to the sops store (`secrets set env.eia_api_key`) before any EIA work #data

## Done

- [x] GA4 + Tag Manager set up from analytics.yaml (2026-10-04): container GTM-PT8ZNQ7Z, version 2 saved and not published; site code on branch analytics-gtm

- [x] Brain brought to the claude-computer standard (2026-10-04): TASKS.md, DECISIONS.md, justfile, .editorconfig, `docs/` index and overview, fleet pointer in CLAUDE.md
