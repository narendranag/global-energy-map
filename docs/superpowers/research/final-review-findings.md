# Final review findings (2026-09-19) — scenario surface after S6 + S1 + T1 + T3

Earlier HIGH fixes spot-checked and confirmed fixed (gas-axis route keys/tags; SDS/SSD + PSX/PSE; anchor-only focus; /query refuses non-SELECT).

## CRITICAL
1. **LNG conversion factor**: `TWH_PER_MT_LNG = 14.447` (`context-model.ts:26-32`, `docs/methodology.md`) is the LOWER heating value (52 GJ/t) labelled HHV with an HHV citation. IGU's conversion guide gives 53.38 mmBtu/t = 56.3 GJ/t = **15.64 TWh/Mt** GCV, and AGSI storage is published on a GCV basis — so the block divides a GCV stock by an LHV flow. Italy Hormuz-LNG 2024: 920 "days" → ~850. Fix the constant, comment, docs, test.
2. **Stale storage shown as latest**: `toGasStorageByCountry` (`src/lib/data/gas-storage.ts:73-99`) has no recency floor; GBR's last AGSI day is 2020-12-30 and GBR is 4th among GIE-covered Hormuz-LNG importers → the panel prints a 2020 reading as context. Drop readings > ~30 days behind the file's global max; say so in the caption; correct the doc comment.

## HIGH
3. Scenario CSV stays importer-side in exporter view (`src/lib/export/scenario.ts:78-95,144-199,206`): emit exporter rows, header line, `_exporters` filename.
4. Combined-scenario camera fits on the previous result (`useScenarioCamera.ts:65,81,88`): `awaiting` must carry the full scenario key and match `result.scenarioIds`.
5. Suez description quotes crude+products (4.85 mb/d) as crude (`registry.ts:127`).
6. **Suez USA = 1.00** is the top-ranked cell (30.3 Mt, 9 % of US crude imports) and the weakest: Gulf→US Gulf Coast VLCCs routinely sail the Cape. Orchestrator decision: **drop USA from `_SUEZ_IMPORTERS`** until a cited share exists (a hole beats a contested number); maintainer may restore.
7. Turkish Straits KAZ 0.80 is a global wildcard: DEU (4.29 Mt, arrives by Druzhba), AUT, CZE, SRB are charged to the Bosporus. Add share-0 pairs for landlocked/pipeline-served buyers; re-reconcile to the verifier's ~0.76 mb/d.
8. Researcher docs + README contradict the shipped surface (`docs/researchers/getting-started.md:27,37,128-141`; `README.md:31,34,38,77`).

## MEDIUM
9. Exporter view flips only the choropleth/legend; asset section, asset tint and "Check a country" stay importer-side unlabelled.
10. Context block never labels severity, quotes the lower bound under a range, and shows importer context in exporter view without saying so.
11. Embed chip names only the primary scenario (reuse ShareMenu's naming).
12. Country-panel note says the combined figure "will be lower or wider"; the combined lower bound is the MAX, so it is ≥ each single row.
13. Keystone highlight stops at Patoka/Cushing (add P5136/P5156 if operating Gulf Coast legs).
14. `goToAsset` flies with no panel padding (`row-actions.ts:46-48`).
15. Hovered ranked row leaks a stuck highlight on unmount (`ScenarioPanel.tsx:141-152`).
16. Bab el-Mandeb `source_note` reuses the "85 % of Suez northbound" statistic the verifier ruled misapplied; missing disclosures: Malacca's Iran omission, Red Sea coverage gap (EGY/JOR/ISR/SDN).
17. `tests/unit/search/match.test.ts` wall-clock budget flakes under load (779 ms, 2,966 ms seen vs 250 ms).

## LOW
18–21. `sev=0/-1` clamp up to 5 % while `sev=banana` → 100 %; dangling `view=`/`sev=` without a scenario; latent stuck-pending if a secondary yields zero rows (compare against ids the loader returned); inverted P3871 comment; "near 9 mb/d" vs EIA 8.7; unused `activeYears` on shipped scenarios (fine), unused `FEATURE_FIT_MAX_ZOOM`/`resetSearchIndexForTests`; `hasRange` can hide the range note; "15 scenarios" vs "11 routes" wording; unreachable Infinity branch.

Checked clean: marker coordinates (all in the right water), `pipelineIds` for Druzhba/BTC/CPC/ESPO, camera edge cases, hover store, old-URL byte identity and garbage-param decoding, multi-scenario loader keys, range maths, ShareMenu round trip, every HELD item absent, all citation URLs verifier-confirmed, region lists, recomputed 2024 volumes (Malacca 12.04 mb/d, Suez 1.93, Bab 0.63, Keystone 0.58, ESPO spur 0.61), T3 arithmetic, privacy.md, hygiene.
