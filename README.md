# global-energy-map

Interactive OSINT visualization of the world's hydrocarbon energy system — reserves, extraction, pipelines, refining, LNG, storage, ports, and bilateral trade — with chokepoint and pipeline disruption scenarios. Built for academics, energy-policy researchers, and IR/economics scholars who think in systems.

**Live:** https://global-energy-map-one.vercel.app

## Status

Phases 1–6 shipped; Phase 7 (correctness) in progress — see `docs/superpowers/specs/2026-09-10-refactor-redesign-review.md` for the roadmap. See `CLAUDE.md` for current state, schema, and conventions.

## What's on the map today

- **5,008 oil & gas extraction sites** (GEM)
- **3,957 oil + gas pipelines** (GEM, with 71% vintage data — the year slider hides post-Y pipelines)
- **1,163 refineries** (NETL primary + OSM supplement, after within-NETL duplicate removal; ~30% with parsed capacity)
- **312 LNG terminals** (LNG-T3 primary + GEM supplement, capacity in mtpa, 97.8% with vintage data)
- **17,592 LNG voyages 2020–2024** (LNG-T3, opt-in layer under the Gas group, filterable by year and confidence)
- **1,046 petroleum basins** (NETL polygons)
- **26,102 storage hubs + 3,694 ports** (NETL)
- **Bilateral trade flows** for crude (HS 2709) and LNG (HS 271111), 1995–2024 (BACI)
- **5 disruption scenarios:** Hormuz, Hormuz-LNG, Druzhba, BTC, CPC
- **Shareable URL state:** year + commodity + scenario + visible layers round-trip through the querystring

## Stack

Next.js 16 + React 19 + TypeScript strict; deck.gl 9 over MapLibre; DuckDB-WASM for in-browser Parquet/GeoParquet queries; Python (uv) build-time data pipeline. No backend for the analytics path — everything is HTTP range reads.

## Docs

- **`CLAUDE.md`** — tech stack, schema, sources, conventions, phase status
- **`docs/data-sources.md`** — researcher-facing inventory: in-production sources, evaluated-and-rejected sources (with reasons), and Phase 7+ candidates
- **`docs/methodology.md`** — current-state methodology, rendered at `/methodology` (the per-phase narrative lives in `docs/history.md`)
- **`/data`** — every shipped file with licence, rows, size and sha256; downloads for openly licensed files
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
uv run python -m pytest tests/python
pnpm test:e2e           # Playwright
```

## License and citation

The code in this repository is licensed under the **MIT License** (see `LICENSE`). The data is sourced under each source's own license, listed per-dataset in `CLAUDE.md`, `docs/data-sources.md`, and `public/data/catalog.json` (rendered on the live `/methodology` and `/data` pages). GEM and LNG-T3 datasets require visible attribution ("Data: Global Energy Monitor, CC BY 4.0" and "Data: Zhou et al. 2026, LNG-T3, CC BY 4.0 (Zenodo 10.5281/zenodo.19571058)" respectively). NETL and EIA data are US Government work (public domain, 17 USC §105). BACI (CEPII) is free for academic/research use. OpenStreetMap derivatives are under ODbL.

If you use this project, please cite it via `CITATION.cff` (also readable through GitHub's "Cite this repository" button).
