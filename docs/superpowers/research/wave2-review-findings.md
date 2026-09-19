# Wave 2 — independent review findings (2026-09-19)

Lint, typecheck, 686 unit tests and 115 e2e specs were green when these were found. Fix list for the post-S1 fix pass.

## Reviewer A — trade flows, search, embed (no critical)

**HIGH**
1. `src/lib/export/layers.ts:77` `scenarioTags` returns `scenario:<id>-lng` for every id on the gas axis, but only hormuz / malacca / suez / bab_el_mandeb have an LNG variant. Pick Druzhba, click Gas → Share sources, the citation and every CSV header silently lose the scenario's route provenance. Same root cause in `routeKeyFor` (`<id>_lng` for oil-only scenarios → no rows). Nothing clears a scenario the new commodity does not support (`page.tsx` `setCommodity`). Fix: gate both on `def.commodities.includes("gas")`, and clear (or annotate) the scenario when the commodity flips away from `def.commodities`.
2. `src/lib/geo/iso3.ts` — Natural Earth uses **SDS** (South Sudan) and **PSX** (Palestine); BACI uses **SSD** / **PSE**. `?focus=SDS` draws zero arcs and the country panel reports zero trade for a country that exported 620 kt of crude in 2024. Fix: NE→BACI alias map applied wherever focus meets trade data (trade-flows.ts, country-profile/-inputs, scenario exposure), plus a test that every focusable code has BACI rows or is knowingly absent (ATA, CYN, KOS, PRI, SAH, SOL).

**MEDIUM**
3. Trade-flows CSV carries no commodity (no column, not in the filter string, same filename for crude and LNG) — `src/lib/export/layers.ts:289-341`, `files.ts:58`.
4. `useMapLayers.ts:102` — countries.geojson (464 KB) now loads unconditionally AND gates `data-ready`; keep the load (pick layer needs it) but leave it out of `pending` unless a choropleth/focus outline needs it.
5. Search highlight ring is never cleared on unmount, on a country pick, or when the query is emptied with the mouse.
6. Embed FOUC: `useSearchParams()` is empty during the static prerender, so an iframe paints header + intro card for a frame. Gate the chrome on hydration (or a server-readable signal).

**LOW**
7. 1,317 BACI rows have null qty; tooltip "share of X's imports" is a share of *quantified* imports — say so in the tooltip/methodology.
8. `tradeFlowsHasNoData` exported, never used; a year outside 1995–2024 makes the layer vanish silently with the toggle on.
9. `next.config.ts:52` comment is wrong — nothing restricts framing of other routes; consider `frame-ancestors 'none'` on `/query`.
10. CLAUDE.md still calls BACI trade view-only; LICENSE-DATA.md and the catalog say downloadable (Etalab 2.0).

Checked clean: `trade_flows` appended at the end of LAYER_KEYS and old links decode identically; all 229 BACI codes have anchors; antimeridian arcs wrap in deck's shader; `embed=1` cannot reach copied links, citations or CSV `View:` lines; snippet builder escapes; attribution bar satisfies LICENSE-DATA.md; search names render as text; aria-activedescendant/controls always valid.

## Reviewer B — focus/camera + click rewrite, country panel, query export gate (no critical)

**The click question, settled:** deck's `onClick` DOES fire under `MapboxOverlay({interleaved:true})` — Deck binds its EventManager to MapLibre's canvas (`@deck.gl/core` deck.js:858/888), the same path that makes hover work. The original S0 spec passing was real; the comment at `MapShell.tsx:190-202` gives a wrong cause. The MapLibre-click + `pickObject` path that replaced it is also correct (no double fire because `onClick` is unset), so keep it — but fix the comment and finding 5.

**HIGH**
1. Focus can be set to a code with no polygon. Top-5 partner rows include SGP, HKG, CUW, MUS, BRB… (`CountryPanel.tsx:99-104`, `page.tsx:61-63` `setFocus` does not validate): the panel opens, no outline, "Zoom to" no-ops, and `?focus=SGP` is rejected by `parseIso3` on reload, so the shared link loses the selection. Fix: gate on `isKnownCountry`; render such rows non-clickable or give them a "no map geometry" state (anchors exist in `country-anchors.ts` — a flyTo to the anchor is possible).

**MEDIUM**
2. Query-console CSV header uses the LIVE editor text and row-limit, not the run that produced the rows (`QueryConsole.tsx:82-97`) — snapshot `{sql, limit}` into the result at run time.
3. Non-SELECT statements still execute (`src/lib/query/engine.ts:114-122` falls back to the raw statement when the LIMIT wrap throws): `CREATE TABLE trade_flow AS …` bricks that table for the session; an unresolved parse registers every parquet; and `COPY (SELECT … view-only) TO '/data/trade_flow.parquet'` then `read_parquet(...)` is an untested laundering path. Fix: refuse to EXECUTE when the parse is not a single SELECT.
4. Country panel overlaps the layer panel below ~1072 px when the scenario panel is open (`page.tsx:302-308` vs `LayerPanel.tsx:124`).
5. `overlay.pickObject` can throw inside the MapLibre click handler before deck's picker exists (`MapShell.tsx:203-219`) → global error panel. try/catch → "no pick".
6. Stale keyboard focus-intent (`focus-intent.ts:20-32`, `CountryPanel.tsx:158-160`) can move focus into the panel on a later mouse click (WCAG 3.2.1). Consume it in the dispatching handler or expire it.
7. Country-panel loader failures escalate to the global error panel via `useAsync` → `reportError`; the panel is off the critical path — use a non-fatal variant.

**LOW**
8. `src/lib/export/country.ts:50` exposure tags list only the 5 original scenarios — derive from `SCENARIOS`.
9. "Crude production" is EI total liquids (USA 2024: 20,276 kb/d vs ~13,200 crude) and shows on the gas axis too — relabel; pre-existing, newly surfaced.
10. `src/lib/export/csv.ts:15-23` no formula-injection guard (`= + - @`); matters for the query console's arbitrary strings.
11. `country-profile.ts:337-350` null/negative-qty rows count in totals but not partner lists, so shares do not reconcile.
12. `loadCountryExposure` cache is unbounded.

Checked clean: the export gate could not be broken (query(), views, information_schema, globs, list args, PIVOT, COPY, shadowing CTEs all refused; every ordinary table form resolved and licence-checked; gate evaluated on the executed text); country-panel exposure ≡ scenario panel; JPN/DEU/IND/USA figures recomputed from parquet match; sparkline edge cases; antimeridian bounds; no double fetch; engine cost single-digit ms.
