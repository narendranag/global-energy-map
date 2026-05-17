# Phase 4 — NETL Basins + Storage + Ports + Shareable URL State

> Status: approved 2026-05-17 (third revision same day; final scope). Builds on Phase 3 (gas + LNG + Hormuz-LNG, shipped 2026-05-16).
>
> Phase 1 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-design.md`
> Phase 2 spec: `docs/superpowers/specs/2026-05-15-global-energy-map-phase-2-design.md`
> Phase 3 spec: `docs/superpowers/specs/2026-05-16-global-energy-map-phase-3-design.md`

## Context

Phase 4's design evolved through three iterations on 2026-05-17 as data availability got clearer:

1. **First scope:** refined-product pipelines + storage hubs + URL state. Pre-plan probe revealed GEM has no clean refined-product layer and no dedicated storage tracker.
2. **Second scope:** USGS basins + URL state. Smaller, honest about what we could verify in public data.
3. **Third scope (this spec):** the user surfaced NETL's GOGI (Global Oil and Gas Infrastructure) dataset hosted at https://arcgis.netl.doe.gov/portal/home/item.html?id=1e1c13b43dfb4af68040598c6f4baf44 — a US DOE / NETL ArcGIS portal with 14 feature services covering global oil & gas assets. Probing confirmed real, queryable, global-coverage data for basins (1,046), storage (26,103), and ports (3,702), among others. We adopt three NETL layers — basins, storage, ports — restoring the original Phase 4 storage + ports axes plus adding the basin layer that's been in the schema since the original design but never populated. URL state ships as the fourth axis.

Phase 4 thus ships:
1. **NETL basin polygons** — populates the long-empty `basin` slot in the schema. Global coverage, rich metadata (md_country, basin_id, area_km2).
2. **NETL oil & gas storage hubs** — 26k points (refined product, crude, LNG, etc.). Display-only this slice; no scenario participation.
3. **NETL oil & gas ports** — 3.7k points with commodity / status / capacity tags.
4. **Shareable URL state** — year + commodity + scenario + visible layers in the querystring, with `router.replace` on every change.

Refined-product pipelines, tankers, LNG carriers, and wells remain deferred — refined products because no clean public source exists at our granularity; tankers because the AIS-source decision deserves its own slice; wells because rendering 4.8M points needs zoom-aware density work that goes beyond Phase 4.

## Locked Decisions

| Axis | Decision |
|---|---|
| Slice scope | NETL basins + NETL storage + NETL ports + shareable URL state |
| Primary new data source | NETL GOGI ArcGIS REST endpoints at `https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted/{Layer}/FeatureServer/0` |
| License | Public domain (US government work, 17 USC §105). Confirmed by metadata: NETL_Admin owner, US DOE. The portal's `licenseInfo` field is empty but US-govt-default applies; will be explicitly cited as "US Government work, public domain" in the methodology page. |
| Refined-product pipelines | **Deferred** — no clean public per-pipeline data source identified (NETL doesn't have a products-specific layer either; their Storage layer includes product storage but pipelines aren't split) |
| Tankers / AIS / LNG carriers | **Deferred** — separate slice, AIS-source decision pending |
| Wells (4.8M features) | **Deferred** — rendering density not solved at this scale |
| Refinery replacement (OSM 168 → NETL 2,272) | **Deferred to its own phase** — Phase 4 doesn't regress Phase 2 data |
| LNG terminals replacement | **Deferred** — Phase 3 GEM data (152 export + 282 import = 434) is comparable to NETL's 329; different counting conventions; leave for future comparison |
| Basin geometry | Polygon (GeoParquet + GeoJSON sidecar). Semi-transparent fill UNDER point/line layers. |
| Basin coloring | Single muted hue (no per-basin-type distinction in v1). Tooltip exposes detail. |
| Storage / ports storage | New rows in `assets.parquet` with `kind ∈ {storage, port}`. Same schema as refinery/LNG rows. |
| Storage capacity field | Use NETL's `capacity` field where populated (NETL ships it as a string; coerce to numeric, NULL on parse fail). `capacity_unit` = `"bbl"` (NETL stores volumes in barrels for oil-side storage). |
| Storage rendering at 26k points | Single ScatterplotLayer with `radiusMinPixels=2`, `radiusMaxPixels=6`. No clustering this slice — Deck.gl handles 26k points fine. If perf regresses, revisit with a SuperCluster-style aggregation in Phase 5. |
| Port rendering | IconLayer (anchor symbol) sized by capacity where tagged, fixed-size where not. |
| Layer panel after Phase 4 | 9 toggles — exceeds the 8-row threshold flagged in earlier specs. Add subdued group headers (Geology / Oil / Gas) for readability. |
| Z-order | Basins (bottom) → reserves choropleth → extraction → pipelines (oil + gas) → refineries → storage → ports → LNG terminals (top) |
| Reprojection | NETL services serve EPSG:3857 (Web Mercator). All ingest scripts reproject to EPSG:4326 before write. |
| Pagination | Layer responses cap at 2,000 records; ingest paginates via `resultOffset` until all features fetched. Shared helper handles this. |
| URL state scope | All UI state — year + commodity + scenario + visible layers (9 toggles now) |
| URL state sync | `router.replace` on every change; defaults silently reapply for missing/invalid params; defaults don't propagate back to URL |
| Scope of slice | One bundled PR — consistent with Phases 1–3 |

## Data Model Extensions

```
basins.parquet                       (NEW — GeoParquet, polygons)
  basin_id (str)         NETL basin_id field
  name (str|null)        Basin name where tagged
  country_iso3 (str|null) ISO3 from md_country (semicolon-split if multi-country, take first)
  area_km2 (float|null)  From NETL area_km2
  region (str|null)      From NETL md_region
  geometry (Polygon | MultiPolygon)
  source (str)           "NETL Global Oil and Gas Infrastructure (GOGI)"
  source_version (str)   ISO date of fetch (NETL doesn't expose a release version)

assets.parquet                       (extend — new kinds)
  + kind="storage" rows  (~26,103)
  + kind="port" rows     (~3,702)
  Reuses existing columns: asset_id, kind, name, country_iso3, lon, lat,
  capacity, capacity_unit, operator, status, commissioned_year, decommissioned_year, source, source_version
  capacity_unit values added: "bbl" (storage), null (ports — NETL capacity is often blank for ports)

catalog.json
  + netl_gogi entry (single entry covers all three layers since they're from the same NETL portal item)
```

**No changes** to `country_year_series`, `trade_flow`, `disruption_route`, `pipelines.parquet`, or any scenario engine code. Scenario engine completely untouched this slice.

## NETL Ingest Pattern (Shared)

Three layers (basins, storage, ports) all use the same access pattern. Shared helper avoids triplicating pagination + reprojection.

```python
# scripts/common/netl.py
import httpx
import geopandas as gpd
from pathlib import Path

NETL_BASE = "https://prod.arcgis.netl.doe.gov/server/rest/services/Hosted"
PAGE_SIZE = 2000

def fetch_netl_layer(
    layer_name: str,
    out_path: Path,
    where: str = "1=1",
) -> int:
    """Fetch all features from a NETL FeatureServer layer with pagination.

    Writes a single GeoJSON file at out_path (EPSG:4326).
    Returns the feature count written.
    """
    # Loop: query with resultOffset=0, 2000, 4000, ... until empty page
    # Each page is fetched as GeoJSON via f=geojson&outSR=4326
    # All pages concatenated into a single GeoJSON FeatureCollection
    # Caller decides whether to convert to GeoParquet downstream
```

Each transform script (`build_basins.py`, `build_storage.py`, `build_ports.py`) then loads the raw GeoJSON, normalizes columns to our schema, and writes the parquet/sidecar.

## URL State Encoding

```
?year=2020
&commodity=gas
&scenario=hormuz
&layers=reserves,extraction,gas_pipelines,lng_terminals,basins,storage,ports
```

**Read:** on initial page load, parse `searchParams`; missing or invalid params fall back to current defaults (year=2020, commodity="oil", scenario=null, all layers on).

**Write:** every state-changing handler calls `router.replace(buildQuerystring(state), { scroll: false })`. No browser history pollution.

**Encoders are pure functions** for trivial unit testing:

```ts
// src/lib/url-state/encode.ts
export interface AppState {
  readonly year: number;
  readonly commodity: Commodity;
  readonly scenario: ScenarioId | null;
  readonly layers: LayerState;
}

export function encodeAppState(s: AppState): string;
export function decodeAppState(params: URLSearchParams, defaults: AppState): AppState;
```

**Defaults policy:** any invalid value falls back to default and is dropped from the URL (so a malformed share-link self-cleans on first interaction).

**Forward-compat note:** if Phase 5 adds a new layer toggle, URLs bookmarked from Phase 4 will load that new layer in its default-OFF state (since the bookmark's `layers=` list won't mention it). This is intentional — URL is authoritative.

## Frontend Architecture

```
src/components/
├── layers/
│   ├── BasinPolygonsLayer.tsx      (NEW — GeoJsonLayer, semi-transparent fill, tooltip)
│   ├── StorageLayer.tsx            (NEW — ScatterplotLayer, 26k points, fixed-radius)
│   ├── PortsLayer.tsx              (NEW — IconLayer, anchor symbol, capacity-sized)
│   ├── LayerPanel.tsx              (extend — 3 new toggles + group headers → 9 total)
│   └── Legend.tsx                  (extend — basin/storage/port swatches)
└── (existing components unchanged)

src/lib/
└── url-state/
    ├── encode.ts                   (NEW — pure functions)
    └── useUrlState.ts              (NEW — React hook wrapping useSearchParams + router.replace)

src/app/
└── page.tsx                        (extend — useUrlState, mount 3 new layers, extend getTooltip)
```

### LayerPanel after Phase 4 (9 toggles with group headers)

```
┌─────────────────────────────────────┐
│ Layers                              │
│ ── Geology ────────────────────── │
│ ☑ Reserves        ▓▓▓░░░  (active) │
│ ☑ Basins           ▒▒▒              │
│ ── Oil ─────────────────────────── │
│ ☑ Extraction       ●                │
│ ☑ Oil pipelines   ━━ ┄┄             │
│ ☑ Refineries       ◆                │
│ ☑ Storage hubs     ■                │
│ ☑ Ports            ⚓                │
│ ── Gas ─────────────────────────── │
│ ☑ Gas pipelines   ━━ ┄┄  (cyan)     │
│ ☑ LNG terminals    ▲ ▽              │
└─────────────────────────────────────┘
```

Group headers are subdued (small uppercase divider rows with no checkbox). Three groups: Geology (reserves + basins), Oil (extraction, oil pipelines, refineries, storage, ports), Gas (gas pipelines, LNG terminals).

Note: extraction sits under Oil even though GEM tags some as oil+gas. Ports often handle multiple commodities; placed under Oil because most of NETL's port records tag commodity as oil or crude. Both choices are defensible; if it bothers you, we can move them.

### BasinPolygonsLayer

`GeoJsonLayer` from deck.gl, fed by sidecar `public/data/basins.geojson` (mirrors Phase 2 pipelines pattern — DuckDB-WASM's spatial extension is unreliable in current builds).

Visual: semi-transparent fill `[120, 100, 80, 50]` (muted brown) with thin same-hue stroke `[120, 100, 80, 200]`. Single hue this slice — no per-basin-type coloring.

Tooltip: name, country_iso3, area_km2, region.

Z-order: above country choropleth, below all other layers.

### StorageLayer

Reads from `assets.parquet` via DuckDB-WASM: `SELECT ... WHERE kind = 'storage'`. ScatterplotLayer with `radiusMinPixels=2`, `radiusMaxPixels=6`, `getFillColor=[170, 100, 40, 180]` (amber-brown). Tooltip: name, country, capacity (bbl), operator, status.

26k points renders fine in Deck.gl WebGL2. If FPS regresses on lower-end machines, the fallback is `radiusMinPixels=1.5` or a SuperCluster-style aggregation in Phase 5.

### PortsLayer

Reads from `assets.parquet` WHERE kind='port'. IconLayer with an inline SVG anchor glyph; mask=true so `getColor` controls the tint at runtime. Color `[60, 80, 100, 230]` (slate). Sized by capacity where populated; fixed 16px otherwise.

## Files to Create / Modify

### Python ingestion + transform
- `scripts/common/netl.py` (new) — shared NETL REST helper: `fetch_netl_layer(layer_name, out_path)` with pagination + EPSG:4326 reprojection
- `scripts/ingest/netl_basins.py` (new) — fetches Basins service to `data/raw/netl/basins.geojson`
- `scripts/ingest/netl_storage.py` (new) — fetches Storage service to `data/raw/netl/storage.geojson`
- `scripts/ingest/netl_ports.py` (new) — fetches Ports service to `data/raw/netl/ports.geojson`
- `scripts/transform/build_basins.py` (new) — reads raw basins GeoJSON, normalizes columns to `basins.parquet` schema, writes `public/data/basins.parquet` + `public/data/basins.geojson`
- `scripts/transform/build_storage.py` (new) — appends `kind='storage'` rows to `assets.parquet` (idempotent: drop prior storage rows before append)
- `scripts/transform/build_ports.py` (new) — appends `kind='port'` rows to `assets.parquet` (idempotent)

### Frontend
- `src/components/layers/BasinPolygonsLayer.tsx` (new)
- `src/components/layers/StorageLayer.tsx` (new)
- `src/components/layers/PortsLayer.tsx` (new)
- `src/components/layers/LayerPanel.tsx` (extend — 3 new toggles + group header rows)
- `src/components/layers/Legend.tsx` (extend — 3 new swatches)
- `src/lib/url-state/encode.ts` (new)
- `src/lib/url-state/useUrlState.ts` (new)
- `src/app/page.tsx` (extend — useUrlState, mount basins+storage+ports, extend getTooltip)

### Catalog updates (`public/data/catalog.json`)
- **New**: `netl_gogi` — single entry covering all three NETL layers (`layers: ["basins", "storage", "ports"]`); License = "US Government work, public domain (17 USC §105)"; Source URL = NETL portal item URL; `as_of` = ISO date of ingest

### Tests
- `tests/unit/url-state/encode.test.ts` — round-trip encode/decode; default fallbacks for missing params; invalid-input tolerance (≥6 tests covering: full round-trip, missing year, unknown commodity, unknown scenario, unknown layer key, bad-typed params)
- `tests/e2e/phase-4.spec.ts` — URL round-trip (load with full querystring → page state matches; flip a toggle → URL updates); basin/storage/port layer visibility toggles; basin tooltip

### Docs
- `docs/methodology.md` — Phase 4 section: NETL GOGI source (with explicit "US Government work, public domain" attribution), the three new layers, URL state semantics including forward-compat caveat
- `CLAUDE.md` — phase status, schema table additions for `basin` row (which was previously listed in main spec but never populated), `kind=storage` and `kind=port` additions to asset row

## Phase 4 Definition of Done

1. Map renders 9 data layers. Basins as semi-transparent muted-brown fills under all point/line layers; 26k storage points render without console errors or FPS regression; ports render as anchor icons.
2. Basin tooltip shows: name, country, area_km2, region. Storage tooltip: name, country, capacity (bbl), operator, status. Port tooltip: name, country, type, commodity, operator.
3. URL state round-trips:
   - Load `/?year=2015&commodity=gas&scenario=hormuz&layers=reserves,basins,lng_terminals` → page state matches exactly.
   - Change any control → URL updates via `router.replace` (no history entry).
   - Bad/missing params → silently fall back to defaults and don't propagate back to the URL.
4. LayerPanel has 9 toggle rows with 3 group headers (Geology / Oil / Gas). All toggles work independently.
5. `pnpm test` passes; new URL-state encode tests cover round-trip + invalid-input + defaults (≥6 tests).
6. `pnpm test:e2e` — phase-4 spec covers URL round-trip + basin/storage/port visibility + basin tooltip.
7. Lint, build, deploy all clean; Lighthouse LCP < 4s still holds; no console errors.
8. Methodology page cites NETL GOGI with public-domain attribution; lists the three new layers with feature counts; documents URL state semantics + forward-compat caveat.

## Non-Goals (Defer)

- **Refined-product pipelines** — no clean public per-pipeline source identified
- **Tanker tracking + LNG carriers** — Phase 4.5 (AIS source decision pending)
- **NETL Wells (4.8M features)** — rendering density / zoom-aware aggregation not solved at that scale
- **Replacing OSM refineries with NETL refineries** — meaningful improvement (168 → 2272) but regresses Phase 2 data; deserves its own phase
- **Replacing/merging GEM LNG terminals with NETL LNG** — different counting conventions need comparison work
- **NETL Power Plants, Mines, Processing Plants, Stations, Railways, Platforms/Pads, Fields** — out of Phase 4 scope; candidates for Phase 5 or beyond
- **Storage participating in scenarios** (days-of-cover, provenance attribution) — no provenance data available even in NETL
- **Storage clustering at small zoom** — defer unless 26k points cause real FPS issues
- **Per-basin-type coloring** — defer to a v2 once we see whether NETL tags basins by oil/gas/mixed cleanly

## Open Items I'd Flag for Your Eye

1. **NETL license explicitness** — the portal item's `licenseInfo` field is empty. US-government-work default is public domain (17 USC §105), and the data is openly served via REST without auth. We'll cite as "US Government work, public domain" in the methodology page. If you have a contact at NETL who can confirm explicitly, that strengthens the attribution.
2. **NETL storage `capacity` field type** — NETL ships capacity as a string, not numeric. Ingest will coerce to float and NULL on parse fail. Spot-check during build that we're not losing data to e.g. "1,500 bbl" formatted strings.
3. **NETL pagination edge cases** — at 2000 records/page and 26,103 storage features = 14 pages. Need to verify pagination works correctly past the standardMaxRecordCount of 16,000. Implementer's task 1 (ingest) should explicitly test page 9+ returns expected counts.
4. **Storage performance at 26k points** — Deck.gl WebGL2 should handle this fine, but a smoke check on a moderate laptop is worth a moment in Task 11 (page.tsx wiring).
5. **GeoJSON file size** — basins (1k polygons) + storage (26k points) + ports (3.7k points) sidecars combined could push another 20-40MB onto the public/data dir. Phase 4 adds to the existing 70MB pipelines.geojson concern. Vercel Blob migration recommended in Phase 5; not blocking for Phase 4.

## Phase 3 Cleanup Carryover

Phase 3 closed cleanly. The two carryover items (catalog id `baci_2709` and the 70MB `pipelines.geojson`) are noted in Phase 4's Open Items above but neither blocks this slice.
