---
id: overview
title: Overview
order: 1
summary: What Global Energy Map is, the ideas behind it, what is in and out of scope, and where the other documents live.
status: stable
updated: 2026-10-04
audience: [everyone]
depends_on: [index]
related: []
defines: [scenario, exposure, vintage]
answers:
  - What is Global Energy Map for?
  - What does it deliberately not do?
  - Where do I read about methodology, data refresh or the machine interface?
---

# Overview

## What it is

A public web app at <https://energymap.marain.space> that lets analysts interrogate global energy dependencies as inspectable, scenario-testable structure: reserves, extraction, pipelines, refineries, LNG terminals and voyages, storage, ports and bilateral trade. The question it leads with is who loses supply when a chokepoint closes or a pipeline is cut.

## The ideas behind it

- **Inspectable.** Every number states its value, unit, year and source on hover. `/methodology` explains each layer, `/data` lists every file with its licence and checksum, and `/query` is a SQL console over the same files.
- **Open.** Downloads are limited to openly licensed files (CC BY, public domain, Etalab); the rest is view-only. See `LICENSE-DATA.md` at the repo root.
- **Static.** No backend: Parquet and GeoJSON files are fetched and decoded in the browser, and built ahead of time by the Python pipeline in `scripts/`.
- **Scenario-first.** The year slider is gone; vintages are stated instead, and pinned `year=` links still work.

## Scope

In: oil and gas assets, bilateral crude and LNG trade, eleven disruption scenarios, exposure accounting. Out: prices, rerouting, strategic stocks, daily flows, and a market model of any kind. Coal and tanker AIS are deferred.

## Where to read next

- Method and caveats: [Methodology](methodology.md) and [Data sources](data-sources.md).
- Bringing data up to date: [Data refresh runbook](refresh.md).
- Researchers: [guide](researchers/README.md). Agents and LLMs: [AI practitioners](ai/README.md).
- Code, stack and commands: `CLAUDE.md` at the repo root.

## What stays hard

Scenario route shares are static across years, and several rest on a single cited sentence. Proved reserves are frozen at 2020 because the Energy Institute stopped updating them. Paid data is ruled out for now on redistribution-licence grounds, not cost; see [Commercial data options](commercial-data-options.md).
