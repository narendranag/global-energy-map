"""Shared NETL GOGI point-layer → assets rows (storage, ports).

NETL point layers share one attribute layout (probed 2026-05-17):
  facility_n  — facility name
  md_country  — country (may list several, ``;``-separated; first used)
  operator    — operator (often blank/space)
  capacity    — capacity as a string (often blank)
  status      — status (often 'NA' or blank)
  fid         — integer feature id (unique per layer; preferred row id)
  md_fkey     — string feature key (NOT unique in ports; fallback only)
"""

from __future__ import annotations

import sys

import pandas as pd

from scripts.common.iso3 import netl_country_iso3
from scripts.common.values import to_float

SOURCE = "NETL Global Oil and Gas Infrastructure (GOGI)"
# NETL serves GOGI from an unversioned live ArcGIS FeatureServer; the snapshot
# in data/raw/netl/ was retrieved on this date. A constant (not date.today())
# keeps rebuilds byte-stable. Update it when the raw snapshot is re-ingested.
SOURCE_VERSION = "2026-05-17"


def _blank_to_none(s: pd.Series, blanks: tuple[str, ...] = ("",)) -> pd.Series:
    """Null out values that are blank (after strip) or in *blanks*."""
    stripped = s.astype("string").str.strip()
    return s.where(~stripped.isin(blanks), other=None)


def build_netl_points(
    gdf: pd.DataFrame,
    *,
    kind: str,
    id_prefix: str,
    capacity_unit: str | None,
) -> pd.DataFrame:
    """Map a NETL point GeoDataFrame to assets rows of *kind*.

    Rows whose country does not resolve, or that have no geometry, are dropped
    (and counted on stderr). Column dtypes are left to ``append_kind``.
    """
    if "fid" in gdf.columns:
        ids = gdf["fid"].astype(str)
    elif "md_fkey" in gdf.columns:
        ids = gdf["md_fkey"].astype(str)
    else:
        ids = pd.Series([str(i) for i in range(len(gdf))], index=gdf.index)

    out = pd.DataFrame(
        {
            "asset_id": (id_prefix + ids.reset_index(drop=True)).values,
            "kind": kind,
            "name": gdf["facility_n"].fillna("").astype(str).values,
            "country_iso3": gdf["md_country"].map(netl_country_iso3).values,
            "lon": gdf.geometry.x.values,
            "lat": gdf.geometry.y.values,
            "capacity": gdf["capacity"].map(to_float).values,
            "capacity_unit": capacity_unit,
            "operator": _blank_to_none(gdf["operator"]).values,
            "status": _blank_to_none(gdf["status"], ("", "NA")).values,
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
        }
    )

    before = len(out)
    out = out[out["country_iso3"].notna() & out["lon"].notna() & out["lat"].notna()]
    dropped = before - len(out)
    if dropped:
        print(f"dropped {dropped} rows with null country or geometry", file=sys.stderr)
    print(f"after geometry+country filter: {len(out)}", file=sys.stderr)
    return out.reset_index(drop=True)
