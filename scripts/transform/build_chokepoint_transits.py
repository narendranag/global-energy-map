"""Transform IMF PortWatch raw JSON → public/data/chokepoint_transits.parquet.

One row per (scenario_id, date): the chokepoint's daily vessel transits (all
types), tanker transits, and tanker deadweight capacity in metric tonnes.
Keyed on our scenario id rather than PortWatch's portid, because the only
reader is the scenario panel's Context block.

View-only: PortWatch's vessel data are Kpler's and the UN Global Platform's,
under the IMF's data terms, so the catalog marks the file not redistributable.

Usage:
    uv run python -m scripts.transform.build_chokepoint_transits
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from scripts.common.sources import PORTWATCH
from scripts.ingest.portwatch_chokepoints import CHOKEPOINTS

RAW_DIR = PORTWATCH.raw_dir
OUT_PATH = Path("public/data/chokepoint_transits.parquet")
SOURCE = "IMF PortWatch"

COLUMNS = [
    "scenario_id",
    "chokepoint",
    "date",
    "transits_all",
    "transits_tanker",
    "tanker_capacity_t",
    "source",
]


def tidy(raw_by_portid: dict[str, list[dict]]) -> pd.DataFrame:
    """Raw PortWatch attribute dicts, per portid → the shipped table."""
    frames = []
    for portid, rows in raw_by_portid.items():
        scenario = CHOKEPOINTS.get(portid)
        if scenario is None:
            raise ValueError(f"unmapped PortWatch chokepoint {portid!r}")
        df = pd.DataFrame(rows)
        frames.append(
            pd.DataFrame(
                {
                    "scenario_id": scenario,
                    "chokepoint": df["portname"],
                    # PortWatch serves the date as "YYYY-MM-DD" text.
                    "date": pd.to_datetime(df["date"]).dt.date,
                    "transits_all": df["n_total"].astype("int64"),
                    "transits_tanker": df["n_tanker"].astype("int64"),
                    "tanker_capacity_t": df["capacity_tanker"].astype("float64"),
                    "source": SOURCE,
                }
            )
        )
    out = pd.concat(frames, ignore_index=True)
    # A page boundary can repeat a day; the last copy is PortWatch's latest.
    out = out.drop_duplicates(["scenario_id", "date"], keep="last")
    return out.sort_values(["scenario_id", "date"]).reset_index(drop=True)[COLUMNS]


def build() -> pd.DataFrame:
    if not RAW_DIR.is_dir():
        raise FileNotFoundError(
            f"{RAW_DIR} missing — run `uv run python -m scripts.ingest.portwatch_chokepoints`"
        )
    raw = {p.stem: json.loads(p.read_text()) for p in sorted(RAW_DIR.glob("chokepoint*.json"))}
    missing = sorted(set(CHOKEPOINTS) - set(raw))
    if missing:
        raise SystemExit(f"no raw PortWatch file for {missing} — rerun the ingest")
    return tidy(raw)


def main() -> None:
    df = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False, compression="zstd")
    last = df.groupby("scenario_id")["date"].max().min()
    print(f"wrote {OUT_PATH}: {len(df):,} rows, every chokepoint through at least {last}")


if __name__ == "__main__":
    main()
