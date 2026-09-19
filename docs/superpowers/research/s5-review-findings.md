# S5 engine extensions — independent review findings (2026-09-19)

Verified: single-scenario results are bit-identical (27,197 exporter→importer pairs on the shipped parquet, 0 differences). No critical/high bug. **T1 must close every item below before the features become reachable from the UI.**

1. **Inbound wildcard is half-landed.** `src/components/scenarios/explain.ts:94-95` is a divergent copy of `resolveScenarioShare` (an inbound row would be filed under pair key `"null→KWT"`, so "Why 0 %?" contradicts the map) → call `resolveScenarioShare`. `src/lib/data/scenario-inputs.ts:49` types `exporter_iso3` non-null → widen `RouteShareRow` to `RouteRow`. `src/lib/export/scenario.ts:57` and `src/app/methodology/page.tsx:64` would print `null → KWT` → use `pairLabel()`.
2. **`howComputed` is never passed options** (`ScenarioPanel.tsx:298`), so it cannot be truthful for severity / combined / exporter view / inbound rows → derive the options from `ScenarioResult` + inputs so they cannot drift.
3. **CSV header ignores `severity` and `scenarioIds`** (`src/lib/export/scenario.ts:135-165`) → severity line when ≠ 1, list every scenario and its share rows, say asset rows are the lower bound.
4. **Engine never applies `routeKeyFor`**: a combined gas run over raw parquet rows returns zero for Hormuz (rows live under `hormuz_lng`); only the single-scenario loader bridges it → filter on `routeKeyFor(id, commodity)` or add a multi-scenario loader that rewrites ids, and throw/warn when an id matches no rows.
5. `combineShares` can return `upper < lower` for shares outside [0,1] → clamp, and assert the range in `build_disruption_routing.py`.
6. `howComputed` does not dedupe `combinedWith`; severity text rounds 0.4 % to "0%".
7. Test gaps: severity on the LNG-T3 voyage path; Σexporter ≡ Σimporter uses an absolute tolerance (use relative); 3+ scenarios; a scenario listed twice.
8. Whoever adds inbound Hormuz rows must extend the explicit share-0 intra-Gulf pair set in the same commit (42 pair rows on `hormuz`, 12 on `hormuz_lng` today) — under the `max` rule an importer-wide 1 otherwise raises ARE→KWT to 1.0.

# Wave 2 polish list (orchestrator's visual check, 2026-09-19)

1. `?mode=flows&focus=JPN` fits the camera to Japan on load (S0's rule), which pushes the focused country's trade arcs — the whole point of focus in Flows — off screen, and at zoom 5 the pixel-width arcs fuse into a wedge. When `trade_flows` is on, the load-time fit should frame the country **and its top partners' anchors** (or not zoom at all), and arc width should be capped lower at high zoom.
2. Bare `?mode=flows` still opens on 2020 (the app default is inside BACI's range, and the preset keeps an in-range year). Deliberate — it preserves what old `?mode=flows` links showed — but the LNG-era blurb "Where LNG cargoes went, 2020–2024 (LNG-T3 voyages)" on the Flows tab is now wrong: the default layer is BACI trade, 1995–2024.
3. The intro card's third bullet and the header strapline still describe the pre-search, pre-query app.
