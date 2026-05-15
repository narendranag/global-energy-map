"""Transform BACI crude oil filtered CSVs into trade_flow.parquet.

Reads per-year filtered CSVs from data/raw/baci/BACI_HS92_Y*_crude.csv,
maps BACI internal numeric country codes to ISO 3166-1 alpha-3 using the
BACI-shipped country_codes_V202601.csv (NOT pycountry — BACI's internal
numeric codes diverge from ISO 3166-1 in 17+ cases, including India=699,
USA=842, France=251, Norway=579, Switzerland=757).

Output schema:
    year          int     calendar year
    importer_iso3 str(3)  3-char ISO 3166-1 alpha-3 (importer)
    exporter_iso3 str(3)  3-char ISO 3166-1 alpha-3 (exporter)
    hs_code       str     "2709"  (canonical HS4)
    value_usd     float   trade value in USD (BACI v * 1000)
    qty           float   quantity in metric tonnes (nullable)
    qty_unit      str     "tonnes"
    source        str     "BACI (CEPII)"

Usage:
    uv run python -m scripts.transform.build_trade_flow
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

RAW_DIR = Path("data/raw/baci")
OUT_PATH = Path("public/data/trade_flow.parquet")
SOURCE = "BACI (CEPII)"
HS_CODE = "2709"
YEAR_MIN = 1995

# ---------------------------------------------------------------------------
# BACI internal numeric → ISO3 mapping
# ---------------------------------------------------------------------------
# BACI ships its own country_codes_V*.csv because it uses internal numeric codes
# that differ from ISO 3166-1 in 17+ cases.  Examples:
#   699 → IND (India)     — ISO 3166-1 numeric for India is 356
#   842 → USA (USA)       — ISO 3166-1 numeric for USA is 840
#   251 → FRA (France)    — ISO 3166-1 numeric for France is 250
#   579 → NOR (Norway)    — ISO 3166-1 numeric for Norway is 578
#   757 → CHE (Switzerland) — ISO 3166-1 numeric for Switzerland is 756
# Using pycountry would silently drop ~17 countries including India and USA.


def _load_baci_country_map() -> dict[int, str]:
    """Load BACI country_codes CSV and return {numeric_code: iso3_alpha} dict.

    Falls back to checking multiple possible filenames for different BACI releases.
    """
    candidates = sorted(RAW_DIR.glob("country_codes_V*.csv"), reverse=True)
    if not candidates:
        raise FileNotFoundError(
            f"No BACI country_codes_V*.csv found in {RAW_DIR}. "
            "Run: uv run python -m scripts.ingest.baci_2709"
        )
    cc_path = candidates[0]
    df = pd.read_csv(cc_path)
    # Columns: country_code, country_name, country_iso2, country_iso3
    mapping: dict[int, str] = {}
    for _, row in df.iterrows():
        iso3 = row.get("country_iso3")
        if pd.notna(iso3) and isinstance(iso3, str) and len(iso3) == 3:
            mapping[int(row["country_code"])] = iso3
    return mapping


def build() -> pd.DataFrame:
    """Read all per-year crude CSVs, map BACI codes to ISO3, return canonical DataFrame."""
    num_to_iso3 = _load_baci_country_map()

    csv_files = sorted(RAW_DIR.glob("BACI_HS92_Y*_crude.csv"))
    if not csv_files:
        raise FileNotFoundError(
            f"No filtered CSVs found in {RAW_DIR}. "
            "Run: uv run python -m scripts.ingest.baci_2709"
        )

    frames: list[pd.DataFrame] = []
    skipped_unmapped = 0
    skipped_self_trade = 0

    for csv_path in csv_files:
        df = pd.read_csv(csv_path, dtype={"i": int, "j": int, "k": int})
        if df.empty:
            continue

        year = int(df["t"].iloc[0])
        if year < YEAR_MIN:
            continue

        # Map BACI numeric codes → ISO3 using BACI's own country_codes file
        df["exporter_iso3"] = df["i"].map(num_to_iso3)
        df["importer_iso3"] = df["j"].map(num_to_iso3)

        # Drop rows where either country code is unmapped (non-standard BACI aggregates
        # like "Europe EFTA, nes" with placeholder iso3="R20" are 3 chars and kept;
        # truly unmapped codes yield NaN)
        n_before = len(df)
        df = df.dropna(subset=["exporter_iso3", "importer_iso3"])
        skipped_unmapped += n_before - len(df)

        # Drop self-trade (data error or re-export artefact)
        self_mask = df["exporter_iso3"] == df["importer_iso3"]
        skipped_self_trade += self_mask.sum()
        df = df[~self_mask]

        if df.empty:
            continue

        # Build canonical schema
        out = pd.DataFrame(
            {
                "year": df["t"].astype(int),
                "importer_iso3": df["importer_iso3"].astype(str),
                "exporter_iso3": df["exporter_iso3"].astype(str),
                "hs_code": HS_CODE,
                "value_usd": df["v"] * 1_000.0,  # BACI v = thousands USD
                "qty": pd.to_numeric(df["q"], errors="coerce"),
                "qty_unit": "tonnes",
                "source": SOURCE,
            }
        )
        frames.append(out)
        print(f"  {year}: {len(out):,} rows")

    if not frames:
        raise RuntimeError("No data frames built — check that filtered CSVs are non-empty.")

    result = pd.concat(frames, ignore_index=True)
    result = result.sort_values(["year", "exporter_iso3", "importer_iso3"]).reset_index(drop=True)

    if skipped_unmapped > 0:
        print(f"  Skipped {skipped_unmapped:,} rows with unmapped country codes")
    if skipped_self_trade > 0:
        print(f"  Skipped {skipped_self_trade:,} self-trade rows")

    return result


def main() -> None:
    print(f"Building {OUT_PATH} from {RAW_DIR}/BACI_HS92_Y*_crude.csv ...")
    print("  Using BACI-shipped country_codes file (not pycountry)")
    df = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False, compression="zstd")
    size_mb = OUT_PATH.stat().st_size / 1_048_576
    print(
        f"\nWrote {OUT_PATH}  "
        f"rows={len(df):,}  "
        f"years={df['year'].min()}-{df['year'].max()}  "
        f"size={size_mb:.2f} MB"
    )


if __name__ == "__main__":
    sys.exit(main())
