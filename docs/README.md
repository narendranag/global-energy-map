---
id: index
title: Global Energy Map documentation
order: 0
summary: Index of the documentation for Global Energy Map, an open model of oil and gas dependency, with links to the guides, runbooks and dated records.
status: stable
updated: 2026-10-04
audience: [everyone]
depends_on: []
related: [overview]
defines: []
answers:
  - Which document covers which topic?
  - What do the core terms mean?
  - Where are the machine-readable versions of these documents?
---

# Global Energy Map documentation

Global Energy Map is an open, inspectable model of oil and gas dependency: pick a disruption (a chokepoint closed, a pipeline cut) and see which importers lose supply. It is for energy-policy researchers, IR and economics scholars and anyone pointing an agent at the data. Live at <https://energymap.marain.space>. How the code is built and run is in `CLAUDE.md` at the repo root; this folder is about what the map is, where its data comes from and how to refresh it.

**Status:** phases 1 to 10 and the post-launch follow-ups are shipped.

## Reading order

| Document                                | What it covers                                                                  | Audience     |
| --------------------------------------- | ------------------------------------------------------------------------------- | ------------ |
| [01 Overview](01-overview.md)           | What the map is, the ideas behind it, scope, and where everything else lives    | Everyone     |

## Guides and runbooks

These keep their original paths. The app, its tests, `public/llms.txt` and GitHub links point at them directly (`docs/methodology.md` and `docs/legal/*.md` are rendered into the site at build time), so they are not renumbered and carry no front matter.

| Document                                                                  | What it covers                                                          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Methodology](methodology.md)                                             | Current-state method per layer and scenario, rendered at `/methodology` |
| [Data sources](data-sources.md)                                           | Inventory of the datasets behind the map                                |
| [Data refresh runbook](refresh.md)                                        | How to bring each source up to date and rebuild `public/data/`          |
| [Performance and caching](performance.md)                                 | What the map loads, how it was measured, what changed                   |
| [Commercial data options](commercial-data-options.md)                     | Research note: a paid, current-data version, and the licensing wall     |
| [Phase history](history.md)                                               | What shipped in each phase, and the caveats that applied then           |
| [Researcher guide](researchers/README.md)                                 | Tour, worked examples, scenario method, coverage, citing, FAQ           |
| [AI practitioners](ai/README.md)                                          | How it was built with agents, the playbook, the machine interface       |
| [Terms](legal/terms.md) and [Privacy](legal/privacy.md)                   | The legal pages, rendered at `/terms` and `/privacy`                    |
| [Announcement drafts](announce/announcement.md)                           | Announcement, fact-check, outreach email, short posts (not yet published) |

## Dated records

Plans, specs, research and hand-offs stay as written, under `superpowers/` and `research/`.

- [GA4 + Tag Manager go-live hand-off, 2026-10-04](HANDOFF-2026-10-04-analytics.md)
- [Session hand-off, 2026-09-21](superpowers/HANDOFF.md)
- [Original design, 2026-05-15](superpowers/specs/2026-05-15-global-energy-map-design.md)
- [Refactor and redesign review, 2026-09-10](superpowers/specs/2026-09-10-refactor-redesign-review.md)
- [Drop the year slider, 2026-09-21](superpowers/plans/2026-09-21-drop-year-slider.md)
- [Data freshness upgrade, 2026-09-17](superpowers/plans/2026-09-17-data-freshness-upgrade.md)
- [Scenario-first framing recommendation, 2026-09-21](superpowers/briefs/2026-09-21-scenario-first-framing-recommendation.md)
- [Tanker AIS sources, 2026-05-19](research/2026-05-19-tanker-ais-sources.md)

The rest of `superpowers/` (phase plans and designs, review findings, research notes) is listed in `CLAUDE.md` under "Phase status".

## Terms used throughout

| Term       | Meaning                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Scenario   | A named disruption, such as Hormuz closed or Druzhba cut, whose exposure is computed per importing country                           |
| Exposure   | The share of an importer's supply that moves through the disrupted route; accounting, not a market model (no prices or rerouting)    |
| Vintage    | The year a layer's data describes, stated wherever a number is shown                                                                 |
| Catalog    | `public/data/catalog.json`: every data file with source, licence, as-of date, rows, bytes and checksum                               |
| BACI       | CEPII's reconciled bilateral trade data, the base for country-to-country crude and LNG flows                                         |
| LNG-T3     | The LNG terminal and AIS voyage dataset used to split country totals across terminals                                                |
| View-only  | A data file that may be shown but not redistributed, because of its licence                                                          |

## Ways to read these documents

| For              | Use                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| People           | [`index.html`](index.html): the standard documents in one static page. Open it in a browser; it needs no server. |
| Agents and tools | [`llms.txt`](llms.txt) for the index, then the Markdown files. [`AGENTS.md`](AGENTS.md) explains the conventions. |
| Programs         | [`data/manifest.json`](data/manifest.json), [`data/glossary.json`](data/glossary.json)                   |

The Markdown files with front matter are the source of truth. `index.html`, `llms.txt` and everything under `data/` are generated by `docs-build`.
