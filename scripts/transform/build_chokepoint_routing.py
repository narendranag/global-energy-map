"""Build chokepoint_route.parquet — fraction of each (exporter, chokepoint) flow.

Phase 1: Strait of Hormuz only, hardcoded shares per EIA chokepoint reports.
Reference: https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

OUT = Path("public/data/chokepoint_route.parquet")
SOURCE = "EIA World Oil Transit Chokepoints (Phase 1 simplification)"

# Share of each exporter's seaborne crude that transits the Strait of Hormuz.
# Based on EIA chokepoint analysis; bypass pipelines reduce the share for KSA and UAE.
HORMUZ_SHARES: dict[str, float] = {
    "IRN": 1.00,
    "IRQ": 1.00,
    "KWT": 1.00,
    "QAT": 1.00,
    "SAU": 0.88,  # ~12% via East-West pipeline to Yanbu (Red Sea)
    "ARE": 0.65,  # Fujairah pipeline bypass to Indian Ocean
    "BHR": 1.00,
}


def main() -> None:
    rows = [
        {"chokepoint_id": "hormuz", "exporter_iso3": iso, "share": share, "source": SOURCE}
        for iso, share in HORMUZ_SHARES.items()
    ]
    df = pd.DataFrame(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), OUT, compression="zstd")
    print(f"wrote {OUT} rows={len(df)}")


if __name__ == "__main__":
    main()
