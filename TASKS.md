# Tasks — Global Energy Map

<!-- Format (shared by every brain): one `- [ ]` per task; optional `📅 YYYY-MM-DD` due date and `#tags`.
     Now / Next / Later / Done. Decisions go in DECISIONS.md. Items below come from CLAUDE.md and
     docs/superpowers/HANDOFF.md (2026-09-21). -->

## Now

- [ ] **Take GA4 + Tag Manager live** — follow docs/HANDOFF-2026-10-04-analytics.md (branch analytics-gtm): consent, Preview, merge, deploy, publish (ask Narendra) #analytics

## Next

- [ ] Announce: the Hormuz fall is real (maintainer, 2026-10-15) but the draft's closure window (28 Feb–7 Apr 2026) ends too early — PortWatch shows ~1 tanker/day from March through 11 Oct 2026; revise the dates and cite #launch
- [ ] Await IMF reply on PortWatch + PCPS (sent to copyright@imf.org 2026-10-15); JODI request sent to jodinfo@ief.org 2026-10-15 #data
- [ ] Announce: `docs/announce/` is drafted and re-verified (2026-09-21) but headed "DO NOT PUBLISH YET"; publishing is the maintainer's call #launch
- [ ] Scheduled refresh: run `scripts/refresh/monthly.sh` by hand once, then load `scripts/refresh/space.marain.energymap.refresh.plist` into launchd (see `docs/refresh.md`) #data
- [ ] Data-year judgement calls in `scripts/transform/build_disruption_routing.py` (Malacca headline year, Suez/Bab el-Mandeb LNG 2018 vintage, Keystone/Enbridge/CPC vintages, Argus/Reuters rows inferred): confirm or reverse each #data

## Later

- [ ] Chokepoint traffic context: direct IMF PortWatch ingest (no ODP) → view-only `ScenarioContext` row, once the IMF says yes (see `docs/02-odp-energy-context-spike.md`) #data
- [ ] Kirkuk–Ceyhan: held; needs a year-bounded share (pipeline shut 2023-03 to 2025-09) and the shipped Hormuz IRQ share moved 0.90 → 0.87 in the same commit #data
- [ ] Inbound Hormuz exposure (needs an importer-wide route wildcard)
- [ ] Pipelines as PMTiles
- [ ] Daily-throughput tooltip, and a vintage filter on scenario inputs (both deferred at Phase 8)
- [ ] Coal sector (GEM mines and plants) and cross-commodity scenarios #data
- [ ] Tankers / AIS: its own brainstorm; sourcing is the gating decision (`docs/research/2026-05-19-tanker-ais-sources.md`) #data
- [ ] EIA API key: add to the sops store (`secrets set env.eia_api_key`) before any EIA work #data

## Done

- [x] ODP spike (2026-10-15): merged to main at the maintainer's call — code and synthetic fixture only, no provider data (`docs/02-odp-energy-context-spike.md`)
- [x] GA4 + Tag Manager set up from analytics.yaml (2026-10-04): container GTM-PT8ZNQ7Z, version 2 saved and not published; site code on branch analytics-gtm

- [x] Brain brought to the claude-computer standard (2026-10-04): TASKS.md, DECISIONS.md, justfile, .editorconfig, `docs/` index and overview, fleet pointer in CLAUDE.md
