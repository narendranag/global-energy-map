"""Transform GEM Oil & Gas Extraction Tracker workbook → extraction rows in assets.parquet.

assets.parquet is shared by five transforms, each of which owns one or more
``kind`` values; all of them write through scripts.common.parquet.append_kind
(drop own kinds → conform to ASSETS_SCHEMA → concat → stable order by kind →
write), so re-running any one of them is safe and leaves the other kinds
untouched. The full rebuild is ``uv run python -m scripts.build_all``.

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
           capacity (float|null)     always null (GEM gives no single figure)
           capacity_unit (str)       "kboe/d" — the unit the layer would use if
                                     capacity were populated
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

from pathlib import Path

import pandas as pd

from scripts.common.iso3 import GEM_NAME_TO_ISO3 as NAME_TO_ISO3
from scripts.common.parquet import ASSETS_PATH, append_kind
from scripts.common.paths import latest

RAW_DIR = Path("data/raw/gem_extraction")
OUT_PATH = ASSETS_PATH
SOURCE = "Global Energy Monitor – Global Oil and Gas Extraction Tracker"
SOURCE_VERSION = "July 2023"
EXTRACTION_KIND = "extraction_site"
# Capacity stays NULL, but the unit is declared so capacity_unit is consistent
# per kind (matches the Phase 3-5 shipped file; see review R4).
EXTRACTION_CAPACITY_UNIT = "kboe/d"


def _coerce_year(val: object) -> int | None:
    """Return an integer year or None."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return int(float(str(val).split("/")[0].split("-")[0].strip()))
    except (ValueError, TypeError):
        return None


def build(xlsx: Path | None = None) -> pd.DataFrame:
    """Read GEM Main data sheet and return normalised assets DataFrame."""
    if xlsx is None:
        xlsx = latest(RAW_DIR, "*.xlsx")
    # Read the "Main data" sheet verbatim (all columns as-is)
    df = pd.read_excel(xlsx, sheet_name="Main data")

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
            "kind": EXTRACTION_KIND,
            "name": df["Unit name"].astype(str),
            "country_iso3": df["country_iso3"].astype(str),
            "lon": df["Longitude"].astype(float),
            "lat": df["Latitude"].astype(float),
            # No per-asset single production figure available without messy unit
            # harmonisation across the Production & reserves sheet; leave null.
            "capacity": None,
            "capacity_unit": EXTRACTION_CAPACITY_UNIT,
            "operator": df["Operator"].where(df["Operator"].notna(), other=None),
            "status": df["Status"].where(df["Status"].notna(), other=None),
            "commissioned_year": df["Production start year"].apply(_coerce_year),
            "decommissioned_year": None,
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        }
    )

    # Column dtypes (nullable years, Float64 capacity, …) are applied by
    # append_kind from ASSETS_SCHEMA.
    return assets.reset_index(drop=True)


def main() -> None:
    df = build()
    combined = append_kind(df, EXTRACTION_KIND, OUT_PATH)
    print(
        f"wrote {OUT_PATH}  extraction_rows={len(df)}  "
        f"by_kind={combined['kind'].value_counts().to_dict()}"
    )
    top_countries = df.groupby("country_iso3").size().sort_values(ascending=False).head(10)
    print("top 10 countries by extraction site count:")
    print(top_countries.to_string())


if __name__ == "__main__":
    main()
