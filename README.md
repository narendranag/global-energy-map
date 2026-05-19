# global-energy-map

Interactive OSINT visualization of the world's hydrocarbon energy system — reserves, extraction, pipelines, refining, LNG, storage, ports, and bilateral trade — with chokepoint and pipeline disruption scenarios. Built for academics, energy-policy researchers, and IR/economics scholars who think in systems.

**Live:** https://global-energy-map-one.vercel.app

## Status

Phases 1–5 shipped. Phase 6+ in planning. See `CLAUDE.md` for current state, schema, and conventions.

## What's on the map today

- **5,008 oil & gas extraction sites** (GEM)
- **3,957 oil + gas pipelines** (GEM, with 71% vintage data — the year slider hides post-Y pipelines)
- **2,360 refineries** (NETL primary + OSM supplement, ~15% with parsed capacity)
- **434 LNG terminals** (GEM, split by import/export, capacity in mtpa)
- **1,046 petroleum basins** (NETL polygons)
- **26,102 storage hubs + 3,694 ports** (NETL)
- **Bilateral trade flows** for crude (HS 2709) and LNG (HS 271111), 1995–2024 (BACI)
- **5 disruption scenarios:** Hormuz, Hormuz-LNG, Druzhba, BTC, CPC
- **Shareable URL state:** year + commodity + scenario + visible layers round-trip through the querystring

## Stack

Next.js 16 + React 19 + TypeScript strict; deck.gl 9 over MapLibre; DuckDB-WASM for in-browser Parquet/GeoParquet queries; Python (uv) build-time data pipeline. No backend for the analytics path — everything is HTTP range reads.

## Docs

- **`CLAUDE.md`** — tech stack, schema, sources, conventions, phase status
- **`docs/data-sources.md`** — researcher-facing inventory: in-production sources, evaluated-and-rejected sources (with reasons), and Phase 6+ candidates
- **`docs/methodology.md`** — chronological per-phase narrative (rendered into `/about`)
- **`docs/superpowers/specs/`** — per-phase design specs + master design
- **`docs/superpowers/plans/`** — per-phase implementation plans

## Local development

```bash
pnpm install
pnpm dev           # localhost:3000

# Data pipeline (one-time setup)
uv sync
uv run python -m scripts.ingest.<source>
uv run python -m scripts.transform.build_<table>

# Tests
pnpm test                # Vitest unit
uv run pytest tests/python
pnpm test:e2e           # Playwright
```

## License

The code in this repository is currently unlicensed; the data is sourced under the licenses listed in `CLAUDE.md` and `docs/data-sources.md`. GEM datasets require visible "Data: Global Energy Monitor, CC BY 4.0" attribution. NETL and EIA data are US Government work (public domain, 17 USC §105). BACI (CEPII) is free for academic/research use. OpenStreetMap derivatives are under ODbL.
