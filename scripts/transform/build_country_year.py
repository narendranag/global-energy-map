"""Transform EI Statistical Review sheets into country_year_series.parquet.

Source sheets used (main "human-readable" xlsx, NOT a panel file):
  - "Oil - Proved reserves history"  : proved reserves in thousand million barrels
                                       (= billion barrels), years 1980-2020
  - "Oil Production - barrels"       : total liquids production in thousand barrels
                                       per day (kbd), years 1965-2024
  - "Gas - Proved reserves history " : gas proved reserves in trillion cubic metres
                                       (Tcm), years 1980-2020 (trailing space in name)

Output schema  (public/data/country_year_series.parquet):
  iso3   str   3-char ISO 3166-1 alpha-3
  year   int   calendar year
  metric str   "proved_reserves_oil_bbn_bbl" | "production_crude_kbpd"
               | "proved_reserves_gas_tcm"
  value  float numeric value (original unit as annotated in *unit* column)
  unit   str   human-readable unit label
  source str   attribution string

Usage:
    uv run python -m scripts.transform.build_country_year
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from scripts.common.iso3 import EI_NAME_TO_ISO3 as NAME_TO_ISO3

XLSX = next(Path("data/raw/ei_statistical_review").glob("*.xlsx"))
OUT_PATH = Path("public/data/country_year_series.parquet")
YEAR_MIN = 1990
SOURCE = "Energy Institute Statistical Review of World Energy 2025"


def _is_aggregate(name: str) -> bool:
    """Return True if the row is a regional/global aggregate to skip."""
    skip_prefixes = (
        "Total",
        "Other",
        "of which",
        "USSR",
        "Non-",
        "Source",
        "Note",
        "Please",
        "Can",
        "Venezuela: Orinoco",
        "#",
        "^",
        "w ",
        " ",
        "Annual",
        "Reserves",
        "Reserves-to",
        "meet",
        "nor",
        "can ",
        "pro",
    )
    stripped = name.strip()
    for prefix in skip_prefixes:
        if stripped.startswith(prefix):
            return True
    # Long footnotes
    return len(stripped) > 60


def _parse_wide_sheet(
    sheet_name: str,
    *,
    header_row: int,
    data_start_row: int,
    metric: str,
    unit: str,
) -> pd.DataFrame:
    """Parse a wide-format EI sheet (countries as rows, years as columns).

    Args:
        sheet_name:    Excel sheet name.
        header_row:    0-indexed row number containing year values.
        data_start_row: 0-indexed row number of first data row (country row).
        metric:        Metric identifier string for output.
        unit:          Unit label string for output.

    Returns:
        Long-format DataFrame with columns [iso3, year, metric, value, unit, source].
    """
    df_raw = pd.read_excel(XLSX, sheet_name=sheet_name, header=None)

    # Extract year header from header_row
    header = df_raw.iloc[header_row].tolist()
    # Column 0 = country name; columns 1..N = year values
    # Year values are floats like 1990.0 or ints; last cols may be text (growth rate)
    year_cols: list[tuple[int, int]] = []
    for col_idx, val in enumerate(header):
        if col_idx == 0:
            continue
        try:
            year = int(float(val))
        except (ValueError, TypeError):
            continue
        if 1900 <= year <= 2100:
            year_cols.append((col_idx, year))

    # Data rows
    records: list[dict] = []
    for row_idx in range(data_start_row, len(df_raw)):
        row = df_raw.iloc[row_idx]
        name = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ""
        if not name or _is_aggregate(name):
            continue
        iso3 = NAME_TO_ISO3.get(name)
        if iso3 is None:
            # Unknown country — skip silently (will include only mapped ones)
            continue
        for col_idx, year in year_cols:
            if year < YEAR_MIN:
                continue
            raw_val = row.iloc[col_idx]
            if pd.isna(raw_val):
                continue
            try:
                value = float(raw_val)
            except (ValueError, TypeError):
                continue
            records.append(
                {
                    "iso3": iso3,
                    "year": year,
                    "metric": metric,
                    "value": value,
                    "unit": unit,
                    "source": SOURCE,
                }
            )

    return pd.DataFrame(records)


def build() -> pd.DataFrame:
    """Build and return the combined long-format DataFrame."""
    # --- Proved Reserves (from 'Oil - Proved reserves history') ---
    # Sheet layout: row 0 = disclaimer, rows 1-3 = multi-line header,
    # row 4 = year header, row 5 = blank, rows 6+ = country data
    df_reserves = _parse_wide_sheet(
        sheet_name="Oil - Proved reserves history",
        header_row=4,
        data_start_row=6,
        metric="proved_reserves_oil_bbn_bbl",
        unit="thousand million barrels (billion barrels)",
    )

    # --- Oil Production (from 'Oil Production - barrels') ---
    # Sheet layout: row 0 = title, row 1 = blank, row 2 = year header,
    # row 3 = blank, rows 4+ = country data
    df_production = _parse_wide_sheet(
        sheet_name="Oil Production - barrels",
        header_row=2,
        data_start_row=4,
        metric="production_crude_kbpd",
        unit="thousand barrels per day",
    )

    # --- Gas Proved Reserves (from 'Gas - Proved reserves history ') ---
    # Sheet layout: rows 0-3 = disclaimer / title / blank / growth-rate labels,
    # row 4 = "Trillion cubic metres" + year headers, row 5 = blank,
    # rows 6+ = country data. Matches oil-reserves layout exactly.
    df_gas_reserves = _parse_wide_sheet(
        sheet_name="Gas - Proved reserves history ",
        header_row=4,
        data_start_row=6,
        metric="proved_reserves_gas_tcm",
        unit="trillion cubic metres",
    )

    combined = pd.concat([df_reserves, df_production, df_gas_reserves], ignore_index=True)
    combined["year"] = combined["year"].astype(int)
    combined["value"] = combined["value"].astype(float)
    combined = combined.sort_values(["metric", "iso3", "year"]).reset_index(drop=True)
    return combined


def main() -> None:
    df = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False, compression="zstd")
    per_metric = df.groupby("metric").size().to_dict()
    print(f"wrote {OUT_PATH}  rows={len(df)}  per_metric={per_metric}")


if __name__ == "__main__":
    sys.exit(main())
