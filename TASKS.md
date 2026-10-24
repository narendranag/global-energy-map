# Tasks — Global Energy Map

<!-- Format (shared by every brain): one `- [ ]` per task; optional `📅 YYYY-MM-DD` due date and `#tags`.
     Now / Next / Later / Done. Decisions go in DECISIONS.md. Items below come from CLAUDE.md and
     docs/superpowers/HANDOFF.md (2026-09-21). -->

## Now

- [ ] **Resume here:** (2026-10-24) Kirkuk–Ceyhan + year-bounded route shares is built on branch `kirkuk-ceyhan` (not pushed, not merged, not deployed): Vitest, pytest, lint and docs green, e2e run in this session (see the commit). Next: Narendra reviews the branch and says merge — a merge to `main` deploys and changes the published Hormuz 2024 headline (12,635 → 12,984 kb/d). Two plans still wait under `## Next` (inbound Hormuz, coal), three questions under `## Later`

## Next

- [ ] Kirkuk–Ceyhan scenario + year-bounded route shares — **built on branch `kirkuk-ceyhan`, waiting for Narendra's merge** #data
  - Shipped on the branch: `valid_from_year`/`valid_to_year` on `disruption_route` (527 rows, 77 dated); `kirkuk_ceyhan` 0.13 ≤2022 / 0 2023–25 / 0.12 ≥2026; Hormuz IRQ 0.87 / 1.00 / 0.88; KAZ→DEU 0.53 from 2023 (0.80 wildcard before); scenario inactive 2023–25 with a note pointing at `year=2022`; windows stated in the panel, CSV and `/methodology`; `/query` examples and researcher SQL filter on the window; worked example, method docs and held announce drafts recomputed.
  - Differs from the plan: the restart regime starts in **2026 at 0.12**, not 2025 at ~0.07 — the TRT article the research cited is the federal line's 18 Mar 2026 reopening (250 kb/d); Kurdish exports restarted 27 Sep 2025 at 180–190 kb/d (Al Jazeera). 2025 counts as shut (about three months open).
  - On merge the live Hormuz 2024 result moves: 12,635 → 12,984 kb/d (27.9 → 28.6 %), most exposed by share Pakistan → Philippines (78.5 %). Shared `year=` links before 2023 move slightly too (Iraq 0.90 → 0.87).
- [ ] Inbound Hormuz exposure — **plan ready, owner's OK**
  - The blocker named in Later is gone: the importer-wide wildcard shipped in S5 (`07a3677`, `src/lib/scenarios/shares.ts`: pair beats wildcards, then max of exporter- and importer-wide). What is missing is **data**: `disruption_route.parquet` has no importer-wide rows, and the routing script still says "imports into the Gulf from outside are out of scope" (a 2026-09-11 call).
  - What: importer-wide rows for `hormuz` and `hormuz_lng` — KWT, BHR, QAT, IRQ, IRN at 1.00 (no ports outside the strait); SAU and ARE partial (Red Sea / Fujairah receive part of their imports), each sourced or marked ESTIMATE as KAZ→DEU is. The 54 intra-Gulf share-0 pairs keep winning, so Gulf-to-Gulf trade stays at zero. Biggest real flow this reveals: Kuwait's LNG imports at Al Zour.
  - Files: `scripts/transform/build_disruption_routing.py` (rows, citations, drop the "out of scope" sentences), `docs/methodology.md` + `_INTRA_GULF_NOTE`, unit test that an inbound row never lowers an existing exposure (already the max rule — pin it with real rows), CSV/methodology regenerate.
  - Size: half a day, most of it sourcing the SAU/ARE splits.
  - Risks: changes published Hormuz rankings (Kuwait, UAE appear as importers at risk); BACI HS 271111 into the Gulf is small and partly re-exports; SAU/ARE shares may only be estimates.
- [ ] Coal sector (GEM mines and plants) and cross-commodity scenarios — **plan ready, owner's OK** (sourcing first) #data
  - What: two asset kinds (`coal_mine`, `coal_plant`) from GEM's Global Coal Mine Tracker and Global Coal Plant Tracker (CC BY 4.0), a third commodity on the axis (BACI HS 2701 coal trade, EI coal production/reserves), and at least one coal chokepoint scenario (Malacca, Indonesia/Australia → China/India/Japan/Korea).
  - Step 0, gating: GEM's public downloads now answer 410 and its CDN is gone (2026-09-17) — check whether a CC BY copy of both coal trackers is reachable (Wayback, GEM's GitHub, a registration form). If only the form is left, that is a step for Narendra, and the plan stops there.
  - Files: `scripts/ingest/gem_coal_{mines,plants}.py`, `scripts/transform/build_coal_assets.py` (append_kind), `scripts/ingest/baci_*` (add HS 2701), `src/lib/symbology` (a coal family distinct from oil-warm and gas-cool — contrast-tested), layers + tooltips + Legend, `Commodity` type and every `commodity` switch (modes, scenario engine route keys, country panel, exports, CSV), catalog, `/methodology`.
  - Size: a phase (several days to two weeks), as Phases 2–3 were; cross-commodity scenarios (one cut, several axes at once) are a further phase on top.
  - Risks: the commodity axis is binary in many places (`isOil ? … : …`); sourcing above; asset count (~13k plants+mines) on the load path — zoom-gate like storage/ports.

- [ ] Await IMF reply on PortWatch + PCPS (sent to copyright@imf.org 2026-10-15); JODI request sent to jodinfo@ief.org 2026-10-15 #data
- [ ] Announce: `docs/announce/` is drafted and re-verified (2026-09-21) but headed "DO NOT PUBLISH YET"; publishing is the maintainer's call #launch
- [ ] Scheduled refresh: run `scripts/refresh/monthly.sh` by hand once, then load `scripts/refresh/space.marain.energymap.refresh.plist` into launchd (see `docs/refresh.md`) #data
- [ ] Data-year judgement calls in `scripts/transform/build_disruption_routing.py` (Malacca headline year, Suez/Bab el-Mandeb LNG 2018 vintage, Keystone/Enbridge/CPC vintages, Argus/Reuters rows inferred): confirm or reverse each #data

## Later

- [ ] (owner) Zone-wide "Always Use HTTPS" on marain.space: the Worker 301s http for pages and /data, but hashed /_next/static files still answer on plain http; `https-check --fix` turns it on for the whole zone (every marain.space site) — your call. HSTS is a separate decision #deploy
- [ ] Pipelines as PMTiles — waiting on Narendra. **Question:** drop it, or keep it deferred? **Proposed default: keep deferred, no work.** `docs/superpowers/research/pmtiles-and-console.md` ruled it "not worth doing now" (one cached ~1.25 MB brotli fetch per data version, tippecanoe not installable here, a second geometry path to keep in step). Re-measured on Cloudflare 2026-10-24: `pipelines.geojson` is 8.1 MB raw, served brotli at 1.94 MB (Cloudflare compresses less hard than Vercel did) — worse, still a once-per-version cost. Revisit if the sidecar passes ~15 MB raw or pipelines go per-segment
- [ ] Daily-throughput tooltip — waiting on Narendra. **Question:** close it? **Proposed default: close as superseded.** The 2026-09-10 review deferred it until there was a daily time axis; the 2026-09-21 call removed every year control, so a daily axis is off the table. The LNG terminal tooltip already shows LNG-T3's "Total processed 2020–2024". `lng_terminal_daily.parquet` (not read at runtime) is sparse — 159 terminals, a median 13 days with throughput per terminal-year — so a "processed in 2024" line would read as complete when it is not
- [ ] Tankers / AIS — waiting on Narendra: sourcing is the gating decision and it is a brainstorm, not a build (`docs/research/2026-05-19-tanker-ais-sources.md`). **Question:** which sourcing route, if any? **Proposed default: none for now** — free live AIS (TankerMap-style) cannot be archived or redistributed, historical AIS is paid, and paid data is ruled out on redistribution-licence grounds (DECISIONS). The free signals already shipped cover the need: LNG-T3 voyages (2020–2024) and IMF PortWatch chokepoint transits (daily, view-only) #data

## Done

- [x] Vintage filter on scenario inputs (deferred at Phase 8) — closed 2026-10-24, already in place where the data allows it: the engine's only asset inputs are refineries and LNG import terminals (`src/components/scenarios/useScenario.ts:60`); LNG terminals are filtered by `lngTerminalsInService` (`src/lib/scenarios/engine.ts:159`, shipped in #23, `24fb880`), and refineries carry no vintage column, so a filter on them is a no-op. Extraction sites (the 78 % undated case the review worried about) never enter a scenario

- [x] Cloudflare Web Analytics beacon kept and disclosed in privacy.md (2026-10-21, Narendra)
- [x] Vercel project global-energy-map deleted (2026-10-21, Narendra); the team-level marain.space domain stays for the marain project
- [x] Cloudflare cutover (2026-10-21): energymap.marain.space is a Worker custom domain; deploy.yml on push to main, smoke green on the live host, https-check ok (the Worker 301s http)
- [x] GA4 + Tag Manager live: container GTM-PT8ZNQ7Z published (gtm.js served, checked 2026-10-20); snippet in layout.tsx, production host only
- [x] EIA API key: already in the sops store as `env.eia_api_key` (confirmed by name 2026-10-15)
- [x] Chokepoint traffic context (2026-10-15): IMF PortWatch daily transits, direct ingest, view-only in the scenario panel's Context block — shipped before the IMF replied, at the maintainer's call
- [x] Announcement Hormuz sentence (2026-10-15): cites CRS R45281 and EIA STEO Aug 2026; says "strikes", not "invasion" (no source found for a ground invasion)
- [x] ODP spike (2026-10-15): merged to main at the maintainer's call — code and synthetic fixture only, no provider data (`docs/02-odp-energy-context-spike.md`)
- [x] GA4 + Tag Manager set up from analytics.yaml (2026-10-04): container GTM-PT8ZNQ7Z, version 2 saved and not published; site code on branch analytics-gtm

- [x] Brain brought to the claude-computer standard (2026-10-04): TASKS.md, DECISIONS.md, justfile, .editorconfig, `docs/` index and overview, fleet pointer in CLAUDE.md
