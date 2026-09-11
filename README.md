# Global Energy Map

An interactive map of the world's oil and gas system: reserves, extraction, pipelines, refineries, LNG terminals and voyages, storage and ports, 1990–2024. It includes disruption scenarios that show who is exposed when a chokepoint or pipeline is cut. It was built for energy-policy researchers and IR/economics scholars who think in systems, and every number on it traces to a cited public source.

**Live: https://energymap.marain.space**

## What it answers

- **What exists, and since when?** Pipelines, extraction sites and LNG terminals respond to the year slider, where their build year is known.
- **Who depends on a chokepoint?** Close the Strait of Hormuz (crude or LNG), or cut Druzhba, Baku–Tbilisi–Ceyhan or the CPC pipeline. The map shades each importer by the share of its imports routed through it, and ranks the refineries and LNG terminals most exposed.
- **Where does LNG actually go?** 17,592 AIS-derived voyages, 2020–2024.
- **Where did a number come from?** Hover anything for its value, unit, year and source. `/methodology` explains each layer, and `/data` lists every file with its licence and checksum.

What it deliberately doesn't do: price responses, rerouting, strategic stocks, or daily flows. Scenario results are exposure accounting, not a market model.

## Start here

| You are… | Read |
|---|---|
| **An energy researcher** using the map | [`docs/researchers/`](docs/researchers/README.md): tour, worked examples with links, the scenario method in plain language, coverage and caveats, citing and reuse, FAQ |
| **Building with AI agents**, or pointing an agent or LLM at this data | [`docs/ai/`](docs/ai/README.md): how this was built with coding agents, the reusable playbook, and the machine interface (URL grammar, schemas, recipes) · [`/llms.txt`](https://energymap.marain.space/llms.txt) |
| **Contributing code or data** | [`CLAUDE.md`](CLAUDE.md) (stack, schema, commands, conventions) · [`docs/refresh.md`](docs/refresh.md) (data refresh runbook) · [`docs/superpowers/`](docs/superpowers/) (specs and plans) |

## What's on the map

| Layer | Count | Source (licence) |
|---|---|---|
| Proved reserves, oil and gas, by country | 1990–2020 (frozen after) | Energy Institute Statistical Review (view only) |
| Oil and gas extraction sites | 5,008 | Global Energy Monitor (CC BY 4.0) |
| Oil, NGL and gas pipelines | 3,957 (build year known for 64 % oil, 74 % gas) | Global Energy Monitor (CC BY 4.0) |
| Refineries | 1,163 (capacity known for 350) | NETL GOGI (public domain) + OpenStreetMap (ODbL) |
| LNG terminals | 312 | LNG-T3, Zhou et al. 2026 (CC BY 4.0) + GEM |
| LNG voyages, 2020–2024 | 17,592 | LNG-T3 (CC BY 4.0) |
| Petroleum basins · storage hubs · ports | 1,046 · 26,102 · 3,694 | NETL GOGI (public domain) |
| Bilateral crude (HS 2709) and LNG (HS 271111) trade, 1995–2024 | 53,727 country-pair-years | CEPII BACI (Etalab Open Licence 2.0) |
| Scenario route shares | 18, each with a citation | EIA / IEA and operator reports |

Known limits that matter:
- reserves stop at 2020;
- BACI starts in 1995 and suppresses Iran's 2023–24 exports;
- implausible BACI quantities are re-estimated from values and flagged;
- LNG-T3 covers 22–41 % of global LNG trade;
- capacity data is sparse for refineries, ports and storage.

See [data and coverage](docs/researchers/data-and-coverage.md).

## Data, licences and citation

- **Downloads.** Openly licensed files (CC BY 4.0, public domain, Etalab 2.0) are downloadable from [`/data`](https://energymap.marain.space/data) and from the map's Share menu. The Energy Institute series and the mixed-licence asset table are view-only; `assets_open.parquet` is the downloadable asset table without the OpenStreetMap rows. Per-source terms and the attribution lines to keep are in [`LICENSE-DATA.md`](LICENSE-DATA.md) (plain language, not legal advice).
- **Cite the map:** Nag, N. (2026). *Global Energy Map* (Version 1.0.0) [Computer software]. https://energymap.marain.space. See [`CITATION.cff`](CITATION.cff) or GitHub's "Cite this repository". To cite a specific view with its source dates, use Share → Cite this view.
- **Code licence:** MIT ([`LICENSE`](LICENSE)).

## Run it locally

```bash
pnpm install
pnpm dev                                   # http://localhost:3000 (predev copies the self-hosted DuckDB files)

# Data pipeline (Python via uv; sources pinned in scripts/common/sources.py)
uv sync
uv run python -m scripts.build_all --ingest   # first time: download pinned sources, then build
uv run python -m scripts.build_all            # rebuild public/data/ from data/raw/ — byte-identical reruns

# Tests
pnpm lint && pnpm typecheck && pnpm test      # ESLint, tsc, Vitest
uv run python -m pytest tests/python          # transforms, schemas, data integrity
pnpm build && CI=1 pnpm test:e2e              # Playwright against a production build (~15 min)
```

**Stack:** Next.js 16, React 19, TypeScript strict; deck.gl 9 inside MapLibre (OpenFreeMap basemap); Parquet read in the browser by hyparquet (DuckDB-WASM stays self-hosted for an upcoming query console but is off the load path). There is no backend: data files are served as static assets with immutable, content-versioned caching. The build-time pipeline is Python (pandas, pyarrow, geopandas, duckdb). CI runs lint, typecheck, unit, Python and e2e tests (including an axe accessibility scan), plus a post-deploy smoke test.

## Project status

Phases 1–10 are complete: layers, scenarios, a correctness pass, consolidation, the product redesign, and launch hardening. The history is in [`docs/history.md`](docs/history.md), and the roadmap and review in [`docs/superpowers/specs/`](docs/superpowers/specs/). Candidate next steps (coal, tanker AIS, per-basin production, pipelines as vector tiles, a query console) are in [`docs/data-sources.md`](docs/data-sources.md).

Found an error in the data or the method? [Open an issue](https://github.com/narendranag/global-energy-map/issues). The map's error panel pre-fills one.
