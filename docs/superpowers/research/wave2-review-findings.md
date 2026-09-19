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
