# Phase 5 — Infra + Polish (Design Spec)

## Goal

Three independent data-quality wins that strengthen the existing surface without expanding the commodity axis. Zero new scenarios, zero new commodities, zero new layers — but pipelines render at 5× smaller file size, refineries get 13× more coverage, and pipelines + extraction sites become vintage-aware so the time slider has real effect on infrastructure layers.

## Scope after empirical probing

Original brainstorm proposed five slices. Probes killed two outright (no analytical content) and clarified two more:

- **GOIT XLSX schema refresh** — DROPPED. The current GeoJSON has 26 properties including owner, parent, start-year, capacity, fuel. The XLSX's "extra" columns are scaled/searchable variants of the same fields, not new analytical content.
- **NETL LNG merge** — DROPPED. Only 1.2% of NETL LNG records have capacity (4 / 329) and the `type` field doesn't distinguish import vs export. No way to merge with GEM's typed mtpa data.
- **Vercel Blob migration for pipelines.geojson** — DROPPED. Geometry simplification at `tolerance=0.005` (~500 m) reduces the sidecar from 67.9 MB to 13 MB, well under the 25 MB ceiling.
- **Per-basin reserves attribution** — DROPPED per user directive. Globally we cannot support change over time (78% of extraction sites have no vintage data). Adding a non-temporal static layer in a time-varying app is a regression. Better Phase 6+ candidate: EIA STEO time-varying production for US shale basins (the only authoritative open per-basin time-series dataset we found).

The three slices that survive are all small, all polish-grade, and all empirically resolved.

## Slice 1 — Pipelines geometry simplification

**Problem.** `public/data/pipelines.geojson` is 73 MB. GitHub flags files over 50 MB; our internal ceiling for single-file in-repo data is 25 MB.

**Solution.** Simplify line geometries before writing the sidecar.

**Probe results.** Tested `shapely.simplify(tolerance, preserve_topology=True)` against the live pipelines:

| Tolerance | Output size | Time |
|---|---|---|
| raw | 67.9 MB | — |
| 0.005 (~500 m) | 13.0 MB | 4.2 s |
| 0.01 (~1 km) | 12.3 MB | 4.1 s |
| 0.02 (~2 km) | 11.8 MB | 4.0 s |
| 0.05 (~5 km) | 11.4 MB | 4.0 s |

All tolerances clear 25 MB. Pick `0.005` — the highest fidelity that still wins the size budget. World/continent zoom won't see the difference; country-zoom kink artifacts are below the 1-pixel threshold at typical viewing scales.

**Change.** Extend `scripts/transform/build_pipelines.py`: after writing the geoparquet, write a simplified GeoJSON sidecar to `public/data/pipelines.geojson` instead of the current full-resolution version.

**Out of scope.** `pipelines.parquet` keeps full-resolution geometry (parquet is already a manageable 34 MB and the analytical path may need precision). Sidecar URL unchanged; no layer-side code change needed.

**Risk.** Simplification could degrade visual quality at high zoom. Mitigation: 500 m tolerance is well below typical city-block scale; spot-check after build.

## Slice 2 — NETL Refineries augmentation

**Problem.** OSM has 168 refineries with zero capacity data. The refinery feedstock attribution math falls back to uniform-within-country for all of them. Major refining hubs in China, India, Saudi Arabia, South Korea are underrepresented.

**Solution.** Augment OSM with NETL's 2,272 refineries from the public-domain GOGI dataset. Keep OSM as the supplemental source for curated names where it has coverage; use NETL as the primary global source.

### Why augment, not replace

Probes revealed both sources have weaknesses:

**OSM (168 refineries):**
- Pro: Curated facility names ("MiRO Mineralölraffinerie Oberrhein," "Fawley Oil Refinery").
- Pro: Includes some operator data and commissioned years.
- Con: Capacity field zero across all 168. Geographic skew toward OECD.

**NETL (2,272 refineries):**
- Pro: 13× the count; comprehensive global coverage.
- Pro: Operator field populated for 80% of records.
- Pro: Capacity populated for 16% (still beats OSM's 0%).
- Con: facility_n blank for 25% (and often blank for the most important refineries — sample of US, Russia, Saudi, China majors had empty facility_n with operator populated).
- Con: Capacity is a STRING field, not numeric. Status populated for only 14%.
- Con: Field names truncated to ~10 chars (legacy shapefile import).

Neither source dominates. The merge produces a strictly better refinery inventory than either alone.

### Strategy: NETL primary, OSM supplement

1. Load NETL as the primary source (2,272 features).
2. For each OSM refinery, check if any NETL refinery falls within 2 km in the same country. If yes, drop the OSM record (NETL covers it). If no, append the OSM record with `source='osm'` provenance.
3. Final dataset: roughly 2,272 + (168 − overlap) refineries, with `source` column ∈ `{osm, netl}`.

### Dedup threshold: 2 km

Empirical nearest-neighbor distance distribution (OSM → nearest NETL):

| Threshold | OSM refineries matched |
|---|---|
| ≤ 0.5 km | 35.7% |
| ≤ 1.0 km | 42.9% |
| ≤ 2.0 km | 48.2% |
| ≤ 5.0 km | 52.4% |
| ≤ 10.0 km | 56.0% |

Inspecting samples:

- 0–2 km band: every sample is clearly the same facility (Joliet/Joliet 0.12 km, Salt Lake City/Salt Lake City 0.09 km, Pembroke 0.02 km).
- 2–10 km band: mixed — Marcus Hook/Trainer (2.0 km) are distinct neighbors in Philadelphia area; Wilmington/Wilmington (5.1 km) is the same.

Settle on **2 km** to err on the side of preserving distinct neighbors over collapsing them. Accept some duplication in the 2–10 km gray zone (~4% of pairs).

### Capacity parsing

Of 355 NETL refineries with non-empty capacity strings:

- 343 (97%) are pure numbers (e.g., `"12000"`, `"59000"`, `"323000"`)
- 12 (3%) are HTML-wrapped: `"<table>...150,000 bpd crude capacity</td>..."` or `"343,000 bpd crude capacity"`

Parser:

1. Strip HTML tags with regex `<[^>]+>`
2. Extract first run of digits and commas
3. Parse as int (drop commas)
4. Unit assumption: bbl/d (consistent with the 12 explicit "bpd crude capacity" records and the magnitude of pure-number records — 12k to 323k matches typical refinery throughputs)
5. Convert to kbpd by dividing by 1000
6. Records that fail to parse: keep capacity NULL (existing uniform-within-country fallback handles this)

100% of populated records parse to a number under this approach.

### Label fallback

NETL field priority: `facility_n || operator || "Refinery"` (since many major refineries have blank facility_n but populated operator).

### Schema delta

`assets.parquet` refinery rows gain:

- `source` column ∈ `{osm, netl}` (TEXT, NOT NULL)
- `capacity` populated more often (for the ~16% of NETL records with parseable values)
- All other columns unchanged

### Methodology page updates

- New `catalog.json` entry for NETL refineries (`license: "US Government work, public domain (17 USC §105)"`)
- Methodology page explains the augmentation strategy with a worked example: e.g., Joliet (OSM "Joliet Refinery") drops because NETL has a record at the same coordinates; Pembroke (UK) drops similarly; some smaller refineries in OSM-rich regions like Germany may also drop.

## Slice 3 — Vintage-aware filtering for pipelines and extraction sites

**Problem.** The time slider is the central UX of the application but currently only affects reserves choropleth and scenario math. A pipeline built in 2020 shows on the 1990 map. An extraction site commissioned in 2015 shows in 1990. Layer behavior contradicts the time-varying premise.

**Probe results.**

| Layer | Vintage field | Populated |
|---|---|---|
| pipelines | `start_year` | **71.2%** (range 1904–2031, median 2010) |
| extraction sites | `commissioned_year` | **21.7%** (median 2002) |
| refineries (OSM) | `commissioned_year` | 0% |
| LNG terminals | — | 0% |
| storage hubs | — | 0% |
| ports | — | 0% |

Pipelines have strong enough coverage to make filtering meaningful. Extraction sites have partial coverage. Refineries, LNG, storage, ports have no vintage data and stay always-visible.

### Behavior

For each affected layer, when the active year is Y:

- Feature with `vintage_year IS NULL` → always visible (preserves current behavior for the 29% of pipelines + 78% of extraction sites without dates)
- Feature with `vintage_year ≤ Y` → visible
- Feature with `vintage_year > Y` → hidden

No `decommissioned_year` filtering: that field is 0% populated.

### Wiring

- `PipelinesLayer`: accept `year` prop. Filter features in the data-prep pass after `commodityFilter` is applied. Already memoized — adding `year` to dependencies is straightforward.
- `ExtractionPoints`: same shape — accept `year`, filter on `commissioned_year`.
- `page.tsx`: pass the active `year` (already available via `useUrlState`) down to both layers.
- Year prop is non-optional — both layers always know the current year.

### Methodology page entry

Brief note: "Vintage-aware filtering applies where source data populates `start_year` (pipelines, 71% coverage) or `commissioned_year` (extraction sites, 22%). Features without these dates appear in all years. Refineries, LNG terminals, storage hubs, and ports have no vintage data in source and appear in all years."

## Schema deltas (full)

| Table | Change |
|---|---|
| `assets.parquet` (kind=refinery) | new column `source` ∈ {osm, netl}; capacity populated more often |
| `assets.parquet` (other kinds) | unchanged |
| `pipelines.parquet` | unchanged (full-res geometry preserved) |
| `pipelines.geojson` sidecar | regenerated at simplification tolerance 0.005 (~13 MB) |
| `catalog.json` | version=4; new `netl_refineries` entry; updated as-of for pipelines |
| `src/lib/data-catalog/index.ts` | version validator allowlist += 4 |

## Testing strategy

Follow the project's TDD-where-it-pays standard:

**Unit tests (Vitest):**
- `tests/unit/refinery-capacity-parser.test.ts` — synthetic inputs: pure number `"59000"`, HTML-wrapped `"<td>150,000 bpd crude</td>"`, plain bpd `"343,000 bpd crude capacity"`, blank `" "`, null, garbage `"n/a"`. 100% of probe-observed patterns should parse.
- `tests/unit/refinery-dedup.test.ts` — synthetic OSM + NETL features at known coordinates: same-country within 2 km → OSM dropped; same-country > 2 km → both kept; different-country regardless of distance → both kept.
- `tests/unit/vintage-filter.test.ts` — pipeline features with `start_year ∈ {null, 1990, 2020}` filtered at year=2000 → expect null and 1990 to pass, 2020 to drop.

**Python unit tests (pytest, if not configured then in-script asserts):**
- Capacity parser tests run on the actual probe samples to lock in the behavior.

**Per-task lint + tests + commit.**

**No e2e for these changes** — they're data-pipeline and layer-rendering tweaks that the existing Playwright smoke test will exercise transitively.

## Risks

| Risk | Mitigation |
|---|---|
| Simplification visual quality at high zoom | 500 m is well below typical city-block scale; spot-check after build. Tolerance is a single constant, easy to tune. |
| OSM-NETL dedup false-merges in 2–5 km gray zone | Accept the duplication. Document in methodology. Lower threshold → more duplication; higher → more false merges. 2 km is the empirical knee. |
| Capacity parser misses an unseen format | Parser falls back to NULL on any error. Uniform-within-country logic then takes over. No worse than current OSM-only state for unparseable records. |
| Vintage filter removes too many pipelines in early years | Null-year fallback (always visible) preserves the 29% of pipelines without dates. Documented in methodology so users understand the partial coverage. |

## Out of scope (carry to Phase 6+)

These were considered and explicitly deferred. See `docs/data-sources.md` for full descriptions.

- EIA STEO tight oil + shale gas time series for US shale basins (8 regions)
- EIA Refinery Capacity Report (US authoritative facility capacities)
- Canada CER Pipeline Throughput (quarterly actual flow)
- USGS World Petroleum Assessment polygons
- GIIGNL Annual Report PDF tables
- KAPSARC Designed Refinery Capacity
- IEA MODS Trade (monthly)
- GEM Coal Plant + Mine Trackers
- GEM Global Oil & Gas Plant Tracker / NETL Power Plants (electricity generation)
- Tanker / LNG carrier AIS

## Definition of done

- `pipelines.geojson` ≤ 15 MB
- `assets.parquet` refinery rows have `source` column populated; row count is roughly 2,300 (down from a naïve 168 + 2,272 = 2,440 after dedup)
- Catalog version = 4, includes NETL refineries entry
- Methodology page documents augmentation strategy and vintage-coverage caveat
- Time slider visibly affects pipeline + extraction layer rendering: setting year=1990 hides post-1990 pipelines that have a start_year
- All unit tests pass; lint clean; build succeeds
- One bundled PR against main, squash-merged
