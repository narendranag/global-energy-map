"""Proximity dedup helper for OSM↔NETL refinery merge.

Probe (Phase 5) determined 2 km is the empirical knee for the same-country
nearest-neighbor distribution: matches ≤ 2 km are virtually always the same
facility, while > 2 km may legitimately be distinct neighbors (e.g., Marcus
Hook / Trainer in the Philadelphia refinery cluster).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

DEDUP_THRESHOLD_KM: float = 2.0
EARTH_RADIUS_KM: float = 6371.0


def haversine_km(lat1: float, lon1: float, lat2_array, lon2_array) -> np.ndarray | float:
    """Vectorized haversine distance in km. Either input may be a scalar or array."""
    lat1r = np.radians(lat1)
    lat2r = np.radians(lat2_array)
    dlat = lat2r - lat1r
    dlon = np.radians(np.asarray(lon2_array) - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1r) * np.cos(lat2r) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def osm_records_not_in_netl(
    osm: pd.DataFrame,
    netl: pd.DataFrame,
    threshold_km: float = DEDUP_THRESHOLD_KM,
) -> pd.DataFrame:
    """Return the subset of OSM rows that have NO NETL counterpart within
    `threshold_km` in the SAME country.

    Both inputs must have columns: country_iso3, lat, lon.
    """
    if osm.empty:
        return osm.copy()
    if netl.empty:
        return osm.copy()

    keep_mask: list[bool] = []
    # Index NETL by country for fast lookup
    netl_by_country: dict[str, pd.DataFrame] = {
        iso3: grp for iso3, grp in netl.groupby("country_iso3")
    }

    for _, row in osm.iterrows():
        iso3 = row["country_iso3"]
        netl_in_country = netl_by_country.get(iso3)
        if netl_in_country is None or netl_in_country.empty:
            keep_mask.append(True)
            continue
        dists = haversine_km(
            row["lat"], row["lon"],
            netl_in_country["lat"].values,
            netl_in_country["lon"].values,
        )
        keep_mask.append(bool(np.all(dists > threshold_km)))

    return osm.loc[keep_mask].copy()
