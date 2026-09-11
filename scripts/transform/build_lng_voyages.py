"""Transform LNG-T3 voyages + trade-daily + terminal-daily → 3 parquets.

Inputs (data/raw/lng_t3/<version>/):
  LNG_tanker_voyage.csv      17,592 voyages 2020-01-01 → 2024-12-31
  LNG_trade_daily.csv        16,691 country-pair-day arrival/departure
  LNG_terminal_daily.csv     16,115 terminal-day throughput

Outputs:
  public/data/lng_voyage.parquet
  public/data/lng_trade_daily.parquet
  public/data/lng_terminal_daily.parquet

All ISO3 attribution uses scripts.common.iso3.lookup_iso3 which
merges GEM + NETL + EI + LNG_T3 country-name dicts.

Idempotent — overwrites the three output files on each run.

Usage:
    uv run python -m scripts.transform.build_lng_voyages
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from scripts.common.iso3 import lookup_iso3
from scripts.common.sources import LNG_T3
from scripts.transform._lng_voyage_helpers import make_unique_ids

RAW_DIR = LNG_T3.raw_dir
OUT_VOYAGE = Path("public/data/lng_voyage.parquet")
OUT_TRADE = Path("public/data/lng_trade_daily.parquet")
OUT_TERMINAL = Path("public/data/lng_terminal_daily.parquet")

SOURCE = "Zhou, C. 2026, LNG-T3 (Zenodo 10.5281/zenodo.19571058)"
SOURCE_VERSION = LNG_T3.release  # pinned in scripts/common/sources.py


def _known_terminal_names() -> set[str]:
    src = RAW_DIR / "LNG_terminal.csv"
    terminals = pd.read_csv(src)
    return set(terminals["name"].astype(str))


def _build_voyages() -> pd.DataFrame:
    src = RAW_DIR / "LNG_tanker_voyage.csv"
    df = pd.read_csv(src, parse_dates=["start_date", "end_date"])
    print(f"[voyage] loaded {len(df)} rows from {src}", file=sys.stderr)

    known_terminals = _known_terminal_names()
    unknown_mask = ~df["from_terminal"].isin(known_terminals) | ~df["to_terminal"].isin(
        known_terminals
    )
    n_misses = int(unknown_mask.sum())
    print(f"[voyage] {n_misses} rows reference an unknown terminal name", file=sys.stderr)
    if n_misses:
        miss_pct = n_misses / len(df) * 100.0
        if miss_pct > 5.0:
            sys.exit(
                f"[voyage] {n_misses} rows ({miss_pct:.1f}%) reference terminal "
                f"names not in LNG_terminal.csv — exceeds 5% tolerance"
            )
        df = df[~unknown_mask].copy()
        print(
            f"[voyage] dropped {n_misses} rows with unknown terminal names, {len(df)} remain",
            file=sys.stderr,
        )

    df["from_country_iso3"] = df["from_country"].map(lookup_iso3)
    df["to_country_iso3"] = df["to_country"].map(lookup_iso3)

    # Assert 100% ISO3 attribution before writing
    miss_from = df["from_country_iso3"].isna().sum()
    miss_to = df["to_country_iso3"].isna().sum()
    if miss_from or miss_to:
        bad_from = df[df["from_country_iso3"].isna()]["from_country"].value_counts()
        bad_to = df[df["to_country_iso3"].isna()]["to_country"].value_counts()
        sys.exit(
            f"unmapped country names in voyages: from={miss_from} {dict(bad_from)} "
            f"to={miss_to} {dict(bad_to)} — extend LNG_T3_NAME_TO_ISO3"
        )

    base_voyage_id = (
        df["start_date"].dt.strftime("%Y%m%d")
        + "_"
        + df["IMO"].astype(str)
        + "_"
        + df["voyage"].astype(str)
    )
    voyage_id = make_unique_ids(base_voyage_id)
    n_disambiguated = int((voyage_id != base_voyage_id).sum())
    if n_disambiguated:
        print(
            f"[voyage] disambiguated {n_disambiguated} colliding voyage_id "
            f"values (start_date+IMO+voyage_type not unique)",
            file=sys.stderr,
        )

    out = pd.DataFrame(
        {
            "voyage_id": voyage_id,
            "start_date": df["start_date"].dt.date,
            "end_date": df["end_date"].dt.date,
            "imo": df["IMO"].astype("Int64"),
            "voyage_type": df["voyage"].astype(pd.StringDtype()),
            "from_terminal": df["from_terminal"].astype(pd.StringDtype()),
            "to_terminal": df["to_terminal"].astype(pd.StringDtype()),
            "from_country": df["from_country"].astype(pd.StringDtype()),
            "to_country": df["to_country"].astype(pd.StringDtype()),
            "from_country_iso3": df["from_country_iso3"].astype(pd.StringDtype()),
            "to_country_iso3": df["to_country_iso3"].astype(pd.StringDtype()),
            # Note: LNG-T3 CSV column is "amount_cmb" — we keep the canonical
            # "amount_cbm" spelling in our parquet schema and rename here.
            "amount_cbm": df["amount_cmb"].astype("Int64"),
            "confidence_score": df["confidence_score"].astype("Int8"),
            "voyage_distance_km": df["voyage_distance"].astype("Int64"),
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        }
    )
    assert out["voyage_id"].is_unique, "voyage_id collisions survived disambiguation"
    return out


def _build_trade_daily() -> pd.DataFrame:
    src = RAW_DIR / "LNG_trade_daily.csv"
    df = pd.read_csv(src, parse_dates=["date"])
    print(f"[trade_daily] loaded {len(df)} rows from {src}", file=sys.stderr)

    df["from_country_iso3"] = df["from_country"].map(lookup_iso3)
    df["to_country_iso3"] = df["to_country"].map(lookup_iso3)
    miss = df[["from_country_iso3", "to_country_iso3"]].isna().any(axis=1).sum()
    if miss:
        sys.exit(f"unmapped country names in trade_daily: {miss}")

    out = pd.DataFrame(
        {
            "date": df["date"].dt.date,
            "type": df["type"].astype(pd.StringDtype()),
            "from_country": df["from_country"].astype(pd.StringDtype()),
            "to_country": df["to_country"].astype(pd.StringDtype()),
            "from_country_iso3": df["from_country_iso3"].astype(pd.StringDtype()),
            "to_country_iso3": df["to_country_iso3"].astype(pd.StringDtype()),
            "amount_cbm": df["amount_cmb"].astype("Int64"),
            "voyage_distance_km": df["voyage_distance"].astype("Float64"),
            # confidence_score in trade_daily is fractional float (e.g. 1.2, 3.5),
            # unlike voyage where it is always integer 1-5. Use Float32 to preserve fidelity.
            "confidence_score": df["confidence_score"].astype("Float32"),
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        }
    )
    return out


def _build_terminal_daily() -> pd.DataFrame:
    src = RAW_DIR / "LNG_terminal_daily.csv"
    df = pd.read_csv(src, parse_dates=["date"])
    print(f"[terminal_daily] loaded {len(df)} rows from {src}", file=sys.stderr)

    out = pd.DataFrame(
        {
            "terminal_name": df["name"].astype(pd.StringDtype()),
            "date": df["date"].dt.date,
            "processed_cbm": df["processed_cbm"].astype("Int64"),
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        }
    )
    return out


def main() -> None:
    if not RAW_DIR.exists():
        sys.exit(f"no LNG-T3 raw at {RAW_DIR} — run scripts.ingest.lng_t3 first")

    voyage = _build_voyages()
    trade = _build_trade_daily()
    terminal = _build_terminal_daily()

    for path, df in [(OUT_VOYAGE, voyage), (OUT_TRADE, trade), (OUT_TERMINAL, terminal)]:
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(
            pa.Table.from_pandas(df, preserve_index=False),
            path,
            compression="zstd",
        )
        print(f"wrote {path}  rows={len(df)}")

    print(
        f"\nVoyage temporal coverage: {voyage['start_date'].min()} → {voyage['start_date'].max()}"
    )
    print(
        f"Voyage confidence distribution: "
        f"{voyage['confidence_score'].value_counts().sort_index().to_dict()}"
    )
    print(
        f"Trade-daily country pairs: "
        f"{trade.groupby(['from_country_iso3', 'to_country_iso3']).ngroups}"
    )
    print(f"Terminal-daily unique terminals: {terminal['terminal_name'].nunique()}")


if __name__ == "__main__":
    main()
