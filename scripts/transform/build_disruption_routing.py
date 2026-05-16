"""Build disruption_route.parquet — chokepoint + pipeline disruptions.

Each row: (disruption_id, kind, exporter_iso3, importer_iso3, share, source)

Share semantics:
- chokepoint: fraction of exporter's seaborne crude that transits the chokepoint
- pipeline: fraction of exporter→importer trade flow that moves on this pipeline

importer_iso3 = None means the share applies to all importers of that exporter.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

OUT = Path("public/data/disruption_route.parquet")
SRC_EIA = "EIA World Oil Transit Chokepoints"
SRC_IEA_PIPELINE = "EIA / IEA pipeline analysis (Phase 2 simplified)"


def _row(
    disruption_id: str,
    kind: str,
    exporter_iso3: str,
    importer_iso3: str | None,
    share: float,
    source: str,
) -> dict:
    """Create a disruption route row."""
    return {
        "disruption_id": disruption_id,
        "kind": kind,
        "exporter_iso3": exporter_iso3,
        "importer_iso3": importer_iso3,
        "share": share,
        "source": source,
    }


# ── Hormuz ──────────────────────────────────────────────────────────────────
HORMUZ = [
    _row("hormuz", "chokepoint", "IRN", None, 1.00, SRC_EIA),
    _row("hormuz", "chokepoint", "IRQ", None, 1.00, SRC_EIA),
    _row("hormuz", "chokepoint", "KWT", None, 1.00, SRC_EIA),
    _row("hormuz", "chokepoint", "QAT", None, 1.00, SRC_EIA),
    _row("hormuz", "chokepoint", "SAU", None, 0.88, SRC_EIA),
    _row("hormuz", "chokepoint", "ARE", None, 0.65, SRC_EIA),
    _row("hormuz", "chokepoint", "BHR", None, 1.00, SRC_EIA),
]

# ── Druzhba (RUS → Central/Eastern Europe) ──────────────────────────────────
DRUZHBA = [
    _row("druzhba", "pipeline", "RUS", "BLR", 1.00, SRC_IEA_PIPELINE),
    _row("druzhba", "pipeline", "RUS", "POL", 0.95, SRC_IEA_PIPELINE),
    _row("druzhba", "pipeline", "RUS", "DEU", 0.60, SRC_IEA_PIPELINE),
    _row("druzhba", "pipeline", "RUS", "SVK", 1.00, SRC_IEA_PIPELINE),
    _row("druzhba", "pipeline", "RUS", "HUN", 1.00, SRC_IEA_PIPELINE),
    _row("druzhba", "pipeline", "RUS", "CZE", 0.90, SRC_IEA_PIPELINE),
]

# ── BTC (Baku-Tbilisi-Ceyhan) ───────────────────────────────────────────────
BTC = [
    _row("btc", "pipeline", "AZE", None, 0.90, SRC_IEA_PIPELINE),
]

# ── CPC (Caspian Pipeline Consortium) ───────────────────────────────────────
CPC = [
    _row("cpc", "pipeline", "KAZ", None, 0.80, SRC_IEA_PIPELINE),
    _row("cpc", "pipeline", "RUS", None, 0.10, SRC_IEA_PIPELINE),
]


def main() -> None:
    rows = HORMUZ + DRUZHBA + BTC + CPC
    df = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(
        pa.Table.from_pandas(df, preserve_index=False),
        OUT,
        compression="zstd",
    )
    counts = df.groupby("disruption_id").size().to_dict()
    print(f"wrote {OUT} rows={len(df)} per-scenario={counts}")


if __name__ == "__main__":
    main()
