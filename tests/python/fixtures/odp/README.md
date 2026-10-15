# ODP spike fixture — synthetic values

Rebuilt by `uv run python -m scripts.ingest.odp_energy_context --fixture` from a real
ODP pull in `data/raw/odp/` (gitignored). Columns, codes, country and chokepoint names
and dates are as ODP returned them; **every number is invented** (a 10.0, 10.5, … ramp).

The repo is public, and none of these series is cleanly redistributable: EIA and IMF
energy prices are Refinitiv/Argus data, PortWatch counts are Kpler's, and JODI states
no licence. See `docs/02-odp-energy-context-spike.md`.
