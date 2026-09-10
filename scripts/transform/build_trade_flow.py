"""Transform BACI hydrocarbon filtered CSVs into trade_flow.parquet.

Reads per-year filtered CSVs for two HS commodity groups:
  - HS 270900 (crude oil):  data/raw/baci/BACI_HS92_Y{year}_crude.csv
  - HS 271111 (LNG):        data/raw/baci/baci_271111_{year}.csv

Maps BACI internal numeric country codes to ISO 3166-1 alpha-3 using the
BACI-shipped country_codes_V202601.csv (NOT pycountry — BACI's internal
numeric codes diverge from ISO 3166-1 in 17+ cases, including India=699,
USA=842, France=251, Norway=579, Switzerland=757).

Output schema:
    year          int     calendar year
    importer_iso3 str(3)  3-char ISO 3166-1 alpha-3 (importer)
    exporter_iso3 str(3)  3-char ISO 3166-1 alpha-3 (exporter)
    hs_code       str     "2709" (crude, HS4) or "271111" (LNG, HS6)
    value_usd     float   trade value in USD (BACI v * 1000)
    qty           float   quantity in metric tonnes (nullable)
    qty_unit      str     "tonnes"
    source        str     "BACI (CEPII)"

IMPORTANT: crude rows keep hs_code="2709" (4-digit) so that the existing
scenario engine query `WHERE hs_code = '2709'` (Hormuz scenario) continues
to work unchanged.  LNG rows use hs_code="271111" (6-digit).

Usage:
    uv run python -m scripts.transform.build_trade_flow
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path

import pandas as pd

from scripts.common.iso3 import TRADE_ISO3_ALLOWLIST

RAW_DIR = Path("data/raw/baci")
OUT_PATH = Path("public/data/trade_flow.parquet")
COUNTRIES_GEOJSON = Path("public/data/countries.geojson")
SOURCE = "BACI (CEPII)"
YEAR_MIN = 1995


# ---------------------------------------------------------------------------
# HS source definitions: (output hs_code label, glob pattern, year-extractor)
# ---------------------------------------------------------------------------
# Crude (Phase 1, HS 270900): BACI_HS92_Y{year}_crude.csv
# LNG   (Phase 3, HS 271111): baci_271111_{year}.csv
def _crude_year(p: Path) -> int:
    m = re.search(r"_Y(\d{4})_", p.name)
    if m is None:
        raise ValueError(f"no year in BACI crude file name {p.name}")
    return int(m.group(1))


HS_SOURCES: list[tuple[str, str, Callable[[Path], int]]] = [
    (
        "2709",
        "BACI_HS92_Y*_crude.csv",
        _crude_year,
    ),
    (
        "271111",
        "baci_271111_*.csv",
        lambda p: int(p.stem.split("_")[-1]),
    ),
]

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


# BACI placeholder codes that stand for a single real territory. BACI's
# country_codes_V202601.csv lists code 490 as "Other Asia, nes" with the
# placeholder iso3 "S19" and has no separate Taiwan row: following UN Comtrade
# practice, Taiwan's trade is reported under "Other Asia, nes", so S19 is
# remapped to TWN (which has a Natural Earth polygon). True aggregates (ZA1
# SACU, …) are not remapped — drop_non_country_codes() removes them.
BACI_CODE_REMAP: dict[str, str] = {"S19": "TWN"}

_KEY_COLS = ["year", "hs_code", "exporter_iso3", "importer_iso3"]


def remap_baci_codes(df: pd.DataFrame, remap: dict[str, str] | None = None) -> pd.DataFrame:
    """Apply BACI_CODE_REMAP to exporter/importer codes.

    If a remapped row collides with an existing row on
    ``(year, hs_code, exporter_iso3, importer_iso3)`` the two are summed
    (``value_usd`` and ``qty``; NaN-only groups stay NaN).
    """
    remap = BACI_CODE_REMAP if remap is None else remap
    out = df.copy()
    out["exporter_iso3"] = out["exporter_iso3"].replace(remap)
    out["importer_iso3"] = out["importer_iso3"].replace(remap)
    dup = out.duplicated(_KEY_COLS, keep=False)
    if not dup.any():
        return out
    print(f"  remap collisions: summing {int(dup.sum())} rows sharing a key after remap")
    other_cols = [c for c in out.columns if c not in (*_KEY_COLS, "value_usd", "qty")]
    agg: dict[str, object] = {
        "value_usd": lambda s: s.sum(min_count=1),
        "qty": lambda s: s.sum(min_count=1),
    }
    agg.update({c: "first" for c in other_cols})
    merged = out[dup].groupby(_KEY_COLS, as_index=False, sort=False).agg(agg)
    combined = pd.concat([out[~dup], merged[out.columns]], ignore_index=True)
    return combined


def load_natural_earth_iso3(path: Path = COUNTRIES_GEOJSON) -> set[str]:
    """Return the ISO3 codes carried by the shipped Natural Earth admin-0 GeoJSON."""
    with open(path) as fh:
        gj = json.load(fh)
    return {
        str(f["properties"]["iso3"]) for f in gj["features"] if f.get("properties", {}).get("iso3")
    }


def valid_trade_iso3(path: Path = COUNTRIES_GEOJSON) -> set[str]:
    """Natural Earth ISO3 set ∪ the explicit allowlist of real non-NE codes."""
    return load_natural_earth_iso3(path) | set(TRADE_ISO3_ALLOWLIST)


def drop_non_country_codes(df: pd.DataFrame, valid: set[str]) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Drop rows whose exporter or importer is not a real country/territory code.

    BACI's country_codes file maps aggregates to 3-char placeholders (``S19``
    "Other Asia, nes", ``ZA1`` SACU, …) that look like ISO3 but are not.

    Returns ``(kept, dropped_summary)`` where ``dropped_summary`` has one row per
    offending code with columns ``code, rows, value_usd, qty`` (a row with both
    sides invalid is counted against each code).
    """
    exp_bad = ~df["exporter_iso3"].isin(valid)
    imp_bad = ~df["importer_iso3"].isin(valid)
    bad = exp_bad | imp_bad
    parts = [
        df.loc[exp_bad, ["exporter_iso3", "value_usd", "qty"]].rename(
            columns={"exporter_iso3": "code"}
        ),
        df.loc[imp_bad, ["importer_iso3", "value_usd", "qty"]].rename(
            columns={"importer_iso3": "code"}
        ),
    ]
    stacked = pd.concat(parts, ignore_index=True)
    summary = (
        stacked.groupby("code", as_index=False)
        .agg(rows=("code", "size"), value_usd=("value_usd", "sum"), qty=("qty", "sum"))
        .sort_values("value_usd", ascending=False)
        .reset_index(drop=True)
    )
    return df.loc[~bad].copy(), summary


def _process_hs_source(
    out_hs: str,
    glob: str,
    year_fn: Callable[[Path], int],
    num_to_iso3: dict[int, str],
) -> tuple[list[pd.DataFrame], int, int]:
    """Process all CSVs for one HS source. Returns (frames, skipped_unmapped, skipped_self)."""
    csv_files = sorted(RAW_DIR.glob(glob))
    if not csv_files:
        print(f"  WARNING: No files found for glob '{glob}' in {RAW_DIR}")
        return [], 0, 0

    frames: list[pd.DataFrame] = []
    skipped_unmapped = 0
    skipped_self_trade = 0

    for csv_path in csv_files:
        df = pd.read_csv(csv_path, dtype={"i": int, "j": int, "k": int})
        if df.empty:
            continue

        year = year_fn(csv_path)
        if year < YEAR_MIN:
            continue

        # Map BACI numeric codes → ISO3 using BACI's own country_codes file
        df["exporter_iso3"] = df["i"].map(num_to_iso3)
        df["importer_iso3"] = df["j"].map(num_to_iso3)

        # Drop rows where either country code is unmapped (NaN). Non-standard BACI
        # aggregates with 3-char placeholders (S19, ZA1, …) survive this step and
        # are removed later by drop_non_country_codes().
        n_before = len(df)
        df = df.dropna(subset=["exporter_iso3", "importer_iso3"])
        skipped_unmapped += n_before - len(df)

        # Drop self-trade (data error or re-export artefact)
        self_mask = df["exporter_iso3"] == df["importer_iso3"]
        skipped_self_trade += int(self_mask.sum())
        df = df[~self_mask]

        if df.empty:
            continue

        # Build canonical schema
        out = pd.DataFrame(
            {
                "year": df["t"].astype(int),
                "importer_iso3": df["importer_iso3"].astype(str),
                "exporter_iso3": df["exporter_iso3"].astype(str),
                "hs_code": out_hs,
                "value_usd": df["v"] * 1_000.0,  # BACI v = thousands USD
                "qty": pd.to_numeric(df["q"], errors="coerce"),
                "qty_unit": "tonnes",
                "source": SOURCE,
            }
        )
        frames.append(out)
        print(f"    {year}: {len(out):,} rows")

    return frames, skipped_unmapped, skipped_self_trade


def build() -> pd.DataFrame:
    """Read all per-year CSVs for all HS sources, map BACI codes to ISO3.

    Returns a combined canonical DataFrame sorted by year / hs_code / exporter / importer.
    """
    num_to_iso3 = _load_baci_country_map()

    all_frames: list[pd.DataFrame] = []
    total_skipped_unmapped = 0
    total_skipped_self_trade = 0

    for out_hs, glob, year_fn in HS_SOURCES:
        print(f"\n  Processing hs_code='{out_hs}' (glob: {glob}) ...")
        frames, skipped_unmapped, skipped_self = _process_hs_source(
            out_hs, glob, year_fn, num_to_iso3
        )
        all_frames.extend(frames)
        total_skipped_unmapped += skipped_unmapped
        total_skipped_self_trade += skipped_self
        hs_rows = sum(len(f) for f in frames)
        print(f"  hs_code='{out_hs}': {hs_rows:,} rows from {len(frames)} files")

    if not all_frames:
        raise RuntimeError("No data frames built — check that filtered CSVs are non-empty.")

    result = pd.concat(all_frames, ignore_index=True)
    result = result.sort_values(["year", "hs_code", "exporter_iso3", "importer_iso3"]).reset_index(
        drop=True
    )

    if total_skipped_unmapped > 0:
        print(f"\n  Skipped {total_skipped_unmapped:,} rows with unmapped country codes")
    if total_skipped_self_trade > 0:
        print(f"  Skipped {total_skipped_self_trade:,} self-trade rows")

    n_remapped = int(
        result["exporter_iso3"].isin(BACI_CODE_REMAP).sum()
        + result["importer_iso3"].isin(BACI_CODE_REMAP).sum()
    )
    result = remap_baci_codes(result)
    print(f"\n  Remapped {n_remapped:,} BACI placeholder codes via {BACI_CODE_REMAP}")
    # Remapping can create self-trade (e.g. S19→TWN re-exports); drop it too.
    self_mask = result["exporter_iso3"] == result["importer_iso3"]
    if self_mask.any():
        print(f"  Dropped {int(self_mask.sum()):,} self-trade rows created by remap")
        result = result[~self_mask]
    result, dropped = drop_non_country_codes(result, valid_trade_iso3())
    result = result.sort_values(_KEY_COLS).reset_index(drop=True)
    if not dropped.empty:
        print(
            f"\n  Dropped rows touching {len(dropped)} non-country BACI codes "
            "(not in Natural Earth ∪ TRADE_ISO3_ALLOWLIST):"
        )
        for r in dropped.itertuples(index=False):
            print(
                f"    {r.code}: rows={r.rows:,}  value_usd={r.value_usd:,.0f}  "
                f"qty_tonnes={r.qty:,.0f}"
            )

    return result


def main() -> None:
    print(f"Building {OUT_PATH} from {RAW_DIR} (HS 270900 + HS 271111) ...")
    print("  Using BACI-shipped country_codes file (not pycountry)")
    df = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False, compression="zstd")
    size_mb = OUT_PATH.stat().st_size / 1_048_576

    hs_counts = df.groupby("hs_code").size().to_dict()
    print(
        f"\nWrote {OUT_PATH}  "
        f"rows={len(df):,}  "
        f"years={df['year'].min()}-{df['year'].max()}  "
        f"size={size_mb:.2f} MB"
    )
    for hs, count in sorted(hs_counts.items()):
        print(f"  hs_code='{hs}': {count:,} rows")


if __name__ == "__main__":
    main()
