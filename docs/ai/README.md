# Global Energy Map for AI practitioners

Two readerships in one folder:

1. **People building software with coding agents.** The Global Energy Map was built almost entirely by Claude Code agents under human direction: ten phases, a multi-agent review, and parallel implementer tracks. These pages record how that worked, what went wrong, and the rules that came out of it.
2. **People pointing agents or LLMs at the map.** The site has a small, stable machine interface: URL parameters that fully describe a view, a machine-readable catalog, and plain Parquet/GeoJSON files. An agent can build links, read the data and cite it correctly.

| Page | For | What's in it |
|---|---|---|
| [how-it-was-built.md](how-it-was-built.md) | builders | Case study: timeline, the review that reset the roadmap, how Phases 7–10 ran as parallel agent tracks, the numbers |
| [agent-playbook.md](agent-playbook.md) | builders | The reusable workflow: review → decisions → plan → disjoint tracks → orchestrator commits → browser verification, plus the failure modes we hit and the rule each one produced |
| [machine-interface.md](machine-interface.md) | agent/LLM users | URL grammar, catalog fields, file schemas, DuckDB/pandas recipes, licensing rules an agent must respect |

Also relevant:

- [`/llms.txt`](../../public/llms.txt), served at https://energymap.marain.space/llms.txt: a short plain-text summary of the site for LLM crawlers and agents.
- [`CLAUDE.md`](../../CLAUDE.md): the living instruction file the agents worked from. It holds the stack, schema, commands and every convention learned the hard way, and is the single most important artefact for anyone continuing the project with an agent.
- [`docs/superpowers/`](../superpowers/): the design specs and per-phase implementation plans the agents executed, including the [refactor/redesign review](../superpowers/specs/2026-09-10-refactor-redesign-review.md).
