"""Proximity dedup helpers for refineries: NETL within-source, then OSM↔NETL.

Probe (Phase 5) determined 2 km is the empirical knee for the same-country
nearest-neighbor distribution: matches ≤ 2 km are virtually always the same
facility, while > 2 km may legitimately be distinct neighbors (e.g., Marcus
Hook / Trainer in the Philadelphia refinery cluster).
"""

from __future__ import annotations

import re

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
            row["lat"],
            row["lon"],
            netl_in_country["lat"].values,
            netl_in_country["lon"].values,
        )
        keep_mask.append(bool(np.all(dists > threshold_km)))

    return osm.loc[keep_mask].copy()


# ---------------------------------------------------------------------------
# Within-source dedup (NETL lists the same plant up to ~4x)
# ---------------------------------------------------------------------------
# NETL GOGI Refineries merges several upstream lists, so one plant often
# appears as an English name ("Myanma Petro-chemical Enterprise (MPE)"), a
# numbered row ("333 - Myanmar Petrochemical Enterprise - Chauk") and a French
# row ("Raffinerie de Chauk (Myanmar)"), all within ~100 m of each other.

NETL_SELF_DEDUP_KM: float = 1.0
# Two capacities further apart than this (relative to the larger) are taken to
# be two distinct plants that happen to sit side by side (BPCL/HPCL Mumbai,
# Shell/Tamoil Hamburg, Melaka I/II); such rows are never merged.
CAPACITY_CONFLICT_REL: float = 0.05

_NUMBERED = re.compile(r"^\d+[a-z]?\s+-\s")  # "333 - …", "513a - …"
_FRENCH = re.compile(r"^Raffinerie\b")  # "Raffinerie de …", "Raffinerie d'…"


def capacities_conflict(a: object, b: object, rel: float = CAPACITY_CONFLICT_REL) -> bool:
    """True when both capacities are known and differ by more than *rel* of the larger."""
    if pd.isna(a) or pd.isna(b):
        return False
    a, b = float(a), float(b)  # type: ignore[arg-type]
    hi = max(abs(a), abs(b))
    return hi > 0 and abs(a - b) / hi > rel


def cluster_same_country(
    df: pd.DataFrame,
    threshold_km: float,
    rel: float | None = CAPACITY_CONFLICT_REL,
) -> np.ndarray:
    """Cluster rows in the same country within *threshold_km* of each other.

    Single linkage, merging the closest pairs first, with one constraint: a
    cluster never holds two conflicting capacities (see
    :func:`capacities_conflict`; pass ``rel=None`` to disable, or omit a
    ``capacity`` column). A merge that would break the constraint is skipped,
    so the conflicting rows stay in separate clusters.

    Returns one label per row (positional): the smallest row position in the
    row's cluster, so labels are deterministic. Needs country_iso3, lat, lon.
    """
    n = len(df)
    parent = np.arange(n)
    has_cap = rel is not None and "capacity" in df.columns
    caps: list[list[float]] = [[] for _ in range(n)]
    if has_cap:
        for i, v in enumerate(df["capacity"].tolist()):
            if pd.notna(v):
                caps[i].append(float(v))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = int(parent[x])
        return x

    iso = df["country_iso3"].to_numpy()
    lat = df["lat"].to_numpy(dtype=float)
    lon = df["lon"].to_numpy(dtype=float)
    pairs: list[tuple[float, int, int]] = []
    for country in pd.unique(iso):
        pos = np.flatnonzero(iso == country)
        for i, p in enumerate(pos[:-1]):
            rest = pos[i + 1 :]
            d = np.atleast_1d(haversine_km(lat[p], lon[p], lat[rest], lon[rest]))
            pairs.extend(
                (float(dd), int(p), int(q))
                for dd, q in zip(d, rest, strict=True)
                if dd <= threshold_km
            )

    for _, p, q in sorted(pairs):
        a, b = find(p), find(q)
        if a == b:
            continue
        if has_cap and any(capacities_conflict(x, y, rel) for x in caps[a] for y in caps[b]):  # type: ignore[arg-type]
            continue
        root, child = min(a, b), max(a, b)
        parent[child] = root
        caps[root].extend(caps[child])
    return np.array([find(i) for i in range(n)])


def keeper_rank(name: object, capacity: object) -> tuple[bool, bool, bool, int]:
    """Sort key (higher is better) for the row that represents a cluster.

    Prefer a known capacity, then a name without a numeric list prefix, then a
    non-French duplicate listing, then the longest name.
    """
    s = name if isinstance(name, str) else ""
    return (
        bool(pd.notna(capacity)),
        not _NUMBERED.match(s),
        not _FRENCH.match(s),
        len(s),
    )


def name_variants(names: list[str]) -> list[str]:
    """Alternative display names for a cluster, best first (duplicates removed).

    Plain English names first, then numbered listings with the list number
    stripped ("333 - MPE - Chauk" → "MPE - Chauk"), then French listings.
    Input order (the cluster's rank order) breaks ties within each group.
    """
    plain = [n for n in names if not _NUMBERED.match(n) and not _FRENCH.match(n)]
    numbered = [_NUMBERED.sub("", n) for n in names if _NUMBERED.match(n)]
    french = [n for n in names if _FRENCH.match(n)]
    return list(dict.fromkeys(n.strip() for n in [*plain, *numbered, *french] if n.strip()))


def choose_names(countries: list[str], candidates: list[list[str]]) -> list[str]:
    """Pick one display name per kept row, unique within its country where possible.

    ``candidates[i]`` lists row *i*'s names best first; ``candidates[i][0]`` is
    its own name. A row keeps its own name unless another kept row in the
    same country has the same one; then every such row takes its first
    variant not used by any other row in that country (a row with no free
    variant keeps its own name).
    """
    chosen = [c[0] for c in candidates]
    by_country: dict[str, list[int]] = {}
    for i, country in enumerate(countries):
        by_country.setdefault(country, []).append(i)
    for rows in by_country.values():
        counts = pd.Series([chosen[i] for i in rows]).value_counts()
        clashing = [i for i in rows if counts[chosen[i]] > 1]
        if not clashing:
            continue
        taken = {chosen[i] for i in rows if i not in clashing}
        for i in clashing:
            free = next((v for v in candidates[i][1:] if v not in taken), None)
            if free is not None:
                chosen[i] = free
            taken.add(chosen[i])
    return chosen


def dedup_within_source(
    df: pd.DataFrame,
    threshold_km: float = NETL_SELF_DEDUP_KM,
    fill_cols: tuple[str, ...] = ("operator", "status"),
) -> tuple[pd.DataFrame, list[list[int]]]:
    """Collapse same-country rows within *threshold_km* to one row per cluster.

    Clusters come from :func:`cluster_same_country` (conflicting capacities are
    never merged). The kept row is the best by :func:`keeper_rank` (ties:
    earliest row); its null *fill_cols* are filled from the other members in
    rank order, and its name is made unique within the country where the
    cluster offers a variant (:func:`choose_names`). Kept rows stay in their
    original relative order. Returns ``(kept, clusters)`` where ``clusters``
    lists the row positions of every multi-row cluster, keeper first.
    """
    if df.empty:
        return df.copy(), []
    df = df.reset_index(drop=True)
    labels = cluster_same_country(df, threshold_km)
    names = df["name"].where(df["name"].notna(), "").astype(str).tolist()
    ranked_by_keeper: dict[int, list[int]] = {}
    for label in pd.unique(labels):
        members = np.flatnonzero(labels == label).tolist()
        ranked = sorted(
            members,
            key=lambda p: (keeper_rank(names[p], df.at[p, "capacity"]), -p),
            reverse=True,
        )
        ranked_by_keeper[ranked[0]] = ranked

    keep_pos = sorted(ranked_by_keeper)
    kept = df.loc[keep_pos].copy()
    for pos in keep_pos:
        ranked = ranked_by_keeper[pos]
        for col in fill_cols:
            if col in df.columns and pd.isna(df.at[pos, col]):
                donor = next((p for p in ranked[1:] if pd.notna(df.at[p, col])), None)
                if donor is not None:
                    kept.at[pos, col] = df.at[donor, col]

    candidates = [
        list(dict.fromkeys([names[pos], *name_variants([names[p] for p in ranked_by_keeper[pos]])]))
        for pos in keep_pos
    ]
    kept["name"] = choose_names(df.loc[keep_pos, "country_iso3"].tolist(), candidates)
    clusters = [ranked_by_keeper[pos] for pos in keep_pos if len(ranked_by_keeper[pos]) > 1]
    return kept.reset_index(drop=True), clusters
