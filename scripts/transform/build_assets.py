"""Transform GEM Oil & Gas Extraction Tracker workbook → assets.parquet.

Source:  data/raw/gem_extraction/Global-Oil-and-Gas-Extraction-Tracker-July-2023.xlsx
         Sheet "Main data" (probed 2026-05-15):
           Unit ID, Unit name, Fuel type, Unit type, Country,
           Latitude, Longitude, Status, Operator, Production start year,
           Discovery year, Wiki URL, …

Output:  public/data/assets.parquet
         Schema:
           asset_id (str)            GEM unit ID, e.g. "OG0000001"
           kind (str)                always "extraction_site"
           name (str)                Unit name
           country_iso3 (str3)       ISO 3166-1 alpha-3
           lon (float)               WGS-84 longitude
           lat (float)               WGS-84 latitude
           capacity (float|null)     best annual production figure (boe/d)
           capacity_unit (str|null)  "boe/d" when populated (else null)
           operator (str|null)       Operator column
           status (str|null)         Status column
           commissioned_year (int)   Production start year
           decommissioned_year (int) null (not available in this dataset)
           source (str)              attribution string
           source_version (str)      e.g. "July 2023"

Column-mapping decisions (verbatim GEM column → output field):
  "Unit ID"              → asset_id      (GEM's own stable project ID)
  "Unit name"            → name
  "Fuel type"            → (stored in kind = "extraction_site"; fuel_type dropped for parquet)
  "Country"              → country_iso3  (via NAME_TO_ISO3 below)
  "Latitude"             → lat
  "Longitude"            → lon
  "Status"               → status
  "Operator"             → operator
  "Production start year"→ commissioned_year
  Discovery year         → not mapped (no equivalent output field)
  capacity/capacity_unit → null for all rows (production data lives in the
                           "Production & reserves" sheet; joining it introduces
                           unit-heterogeneity, so we leave capacity null and
                           let downstream queries join if needed)

Usage:
    uv run python -m scripts.transform.build_assets
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from scripts.common.iso3 import GEM_NAME_TO_ISO3 as NAME_TO_ISO3

XLSX = next(Path("data/raw/gem_extraction").glob("*.xlsx"))
OUT_PATH = Path("public/data/assets.parquet")
SOURCE = "Global Energy Monitor – Global Oil and Gas Extraction Tracker"
SOURCE_VERSION = "July 2023"


def _coerce_year(val: object) -> int | None:
    """Return an integer year or None."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return int(float(str(val).split("/")[0].split("-")[0].strip()))
    except (ValueError, TypeError):
        return None


def build() -> pd.DataFrame:
    """Read GEM Main data sheet and return normalised assets DataFrame."""
    # Read the "Main data" sheet verbatim (all columns as-is)
    df = pd.read_excel(XLSX, sheet_name="Main data")

    # --- Drop rows missing coordinates (383 of 5391) ---
    before = len(df)
    df = df.dropna(subset=["Latitude", "Longitude"])
    after = len(df)
    print(f"dropped {before - after} rows missing lat/lon; {after} remain")

    # --- Map country name → ISO3 ---
    df["country_iso3"] = df["Country"].map(NAME_TO_ISO3)
    unmapped = df["country_iso3"].isna().sum()
    if unmapped:
        print(f"WARNING: {unmapped} rows have unmapped country names:")
        print(df.loc[df["country_iso3"].isna(), "Country"].value_counts().to_dict())
    df = df.dropna(subset=["country_iso3"])

    # --- Build output DataFrame ---
    assets = pd.DataFrame(
        {
            # GEM's own stable project ID (e.g. "OG0000001")
            "asset_id": df["Unit ID"].astype(str),
            "kind": "extraction_site",
            "name": df["Unit name"].astype(str),
            "country_iso3": df["country_iso3"].astype(str),
            "lon": df["Longitude"].astype(float),
            "lat": df["Latitude"].astype(float),
            # No per-asset single production figure available without messy unit
            # harmonisation across the Production & reserves sheet; leave null.
            "capacity": None,
            "capacity_unit": None,
            "operator": df["Operator"].where(df["Operator"].notna(), other=None),
            "status": df["Status"].where(df["Status"].notna(), other=None),
            "commissioned_year": df["Production start year"].apply(_coerce_year),
            "decommissioned_year": None,
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        }
    )

    # Enforce proper nullable int dtype for year columns
    assets["commissioned_year"] = pd.array(assets["commissioned_year"], dtype=pd.Int32Dtype())
    assets["decommissioned_year"] = pd.array(
        [None] * len(assets), dtype=pd.Int32Dtype()
    )

    # Enforce forward-compatible dtypes for currently-all-null columns
    # to avoid Pandas inferring wrong types when writing to Parquet
    assets["capacity"] = assets["capacity"].astype("Float64")  # nullable float
    assets["capacity_unit"] = assets["capacity_unit"].astype(pd.StringDtype())  # nullable string

    return assets.reset_index(drop=True)


def main() -> None:
    df = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False, compression="zstd")
    print(f"wrote {OUT_PATH}  rows={len(df)}")
    top_countries = (
        df.groupby("country_iso3").size().sort_values(ascending=False).head(10)
    )
    print("top 10 countries by extraction site count:")
    print(top_countries.to_string())


if __name__ == "__main__":
    sys.exit(main())
