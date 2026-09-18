"""Transform UN Comtrade monthly JSON → public/data/comtrade_monthly.parquet.

Supplements BACI, never merged with it. BACI reconciles both sides of every
flow and is annual through 2024; Comtrade is the importer's own declaration,
monthly, and reaches ~18 months further forward. Blending them would present
two different measurements as one series, so they stay in separate tables and
the UI has to say which it is showing.

Three things this transform must get right, all of which would be invisible
if it got them wrong:

1. **World aggregates.** 31 % of raw rows carry `partnerCode == 0`, which is
   the reporter's total trade, not a bilateral flow. Keeping them would roughly
   inflate every total by half.
2. **Country codes.** Comtrade reports M49 numerics with the ISO fields null.
   BACI already ships an M49 → ISO3 map and uses the same code system, so it is
   reused rather than duplicated — one map, one place to fix.
3. **Coverage.** Comtrade backfills for months after the fact. Mature months
   carry 68–78 reporters; 2026-08 carried one. Publishing that as a trade flow
   would draw a catastrophic collapse that is purely an artefact of reporting
   lag. Months below MIN_REPORTERS are dropped, and every surviving row carries
   its month's reporter count so a consumer cannot ignore the thinning.

Usage:
    uv run python -m scripts.transform.build_comtrade_monthly
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from scripts.common.sources import COMTRADE
from scripts.transform.build_trade_flow import _load_baci_country_map

RAW_DIR = COMTRADE.raw_dir
OUT_PATH = Path("public/data/comtrade_monthly.parquet")
SOURCE = COMTRADE.name
SOURCE_VERSION = COMTRADE.release

# Mature months report 68–78 reporters. Below 50 a month is missing a third of
# the world and its totals fall for reasons that have nothing to do with trade.
# Raising this is safe; lowering it puts reporting lag on the map as if it were
# a real signal.
MIN_REPORTERS = 50

# Comtrade's own aggregate partner ("World"), not a bilateral counterparty.
WORLD_PARTNER_CODE = 0

# Comtrade returns a (reporter, partner) pair several times over, partitioned by
# customs procedure, mode of transport and second partner, plus one row that is
# the total of them. Germany–Kazakhstan for 2025-01 arrives as 22 rows. Summing
# them inflated Germany's 2025 crude imports to $319bn against BACI's $42bn for
# 2024. Keep only the totals row: customs "C00", mode 0, second partner 0.
TOTALS_PARTITION = {"customsCode": "C00", "motCode": 0, "partner2Code": 0}


def _rows_for(path: Path, iso3_of: dict[int, str]) -> list[dict]:
    period = path.stem.split("_")[0]
    out: list[dict] = []
    for r in json.loads(path.read_text()):
        if r.get("partnerCode") == WORLD_PARTNER_CODE:
            continue
        if any(r.get(k) != v for k, v in TOTALS_PARTITION.items()):
            continue
        importer = iso3_of.get(r.get("reporterCode"))
        exporter = iso3_of.get(r.get("partnerCode"))
        if importer is None or exporter is None:
            continue
        if importer == exporter:
            continue
        value = r.get("primaryValue")
        qty = r.get("qty")
        out.append(
            {
                "month": f"{period[:4]}-{period[4:]}-01",
                "importer_iso3": importer,
                "exporter_iso3": exporter,
                "hs_code": str(r.get("cmdCode")),
                "value_usd": float(value) if value is not None else None,
                "qty": float(qty) if qty is not None else None,
                # Comtrade's qty for these codes is net weight in kg.
                "qty_unit": "kg",
                "source": SOURCE,
            }
        )
    return out


def build() -> pd.DataFrame:
    iso3_of = _load_baci_country_map()
    files = sorted(RAW_DIR.glob("*.json"))
    if not files:
        raise FileNotFoundError(
            f"{RAW_DIR} empty — run `uv run python -m scripts.ingest.comtrade_monthly` first"
        )

    rows: list[dict] = []
    for path in files:
        rows.extend(_rows_for(path, iso3_of))
    df = pd.DataFrame(rows)
    if df.empty:
        raise SystemExit("no Comtrade rows parsed — check data/raw/comtrade/")

    # Reporter count per month, before any coverage filtering.
    reporters = df.groupby("month")["importer_iso3"].nunique().rename("reporters_in_month")
    df = df.join(reporters, on="month")

    thin = sorted(reporters[reporters < MIN_REPORTERS].index)
    if thin:
        print(
            f"dropping {len(thin)} month(s) below {MIN_REPORTERS} reporters "
            f"(reporting lag, not a real decline): "
            + ", ".join(f"{m[:7]}={reporters[m]}" for m in thin),
            file=sys.stderr,
        )
    df = df[df["reporters_in_month"] >= MIN_REPORTERS].copy()

    df["month"] = pd.to_datetime(df["month"]).dt.date
    df["reporters_in_month"] = df["reporters_in_month"].astype("int64")
    df = df.sort_values(["month", "hs_code", "importer_iso3", "exporter_iso3"])
    return df.reset_index(drop=True)


def main() -> None:
    df = build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_PATH, index=False, compression="zstd")
    print(
        f"wrote {OUT_PATH}  rows={len(df)}  "
        f"months={df['month'].min()}…{df['month'].max()}  "
        f"importers={df['importer_iso3'].nunique()}"
    )
    for code, n in df["hs_code"].value_counts().sort_index().items():
        print(f"    HS{code}: {n} rows")


if __name__ == "__main__":
    main()
