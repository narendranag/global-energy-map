"""Compare LNG-T3 annual arrivals to GIIGNL public totals.

GIIGNL Annual Report public headline numbers (in million tonnes, LNG imports):
  2020: 356.1
  2021: 372.3
  2022: 401.5
  2023: 401.4
  2024: ~407  (estimate from press release)

Source: GIIGNL Annual Reports 2021–2025 executive summaries (publicly
available PDFs at giignl.org/annual-report). Hard-coded here because
the report tables are non-machine-readable; rerun this script if/when
GIIGNL revises retrospectively.

LNG density conversion: 1 cbm liquid LNG ≈ 0.4245 t (DOE convention).

Usage:
    uv run python -m scripts.validate.lng_t3_vs_giignl
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

TRADE_DAILY = Path("public/data/lng_trade_daily.parquet")
LNG_DENSITY_T_PER_CBM = 0.4245

# GIIGNL Annual Report public totals (million tonnes per annum)
GIIGNL_MT_PER_YEAR: dict[int, float] = {
    2020: 356.1,
    2021: 372.3,
    2022: 401.5,
    2023: 401.4,
    2024: 407.0,  # 2025 GIIGNL report; treat as ±5
}

ACCEPTABLE_GAP_PCT = 30.0  # spec threshold


def main() -> None:
    if not TRADE_DAILY.exists():
        sys.exit(f"missing {TRADE_DAILY} — run build_lng_voyages first")
    df = pd.read_parquet(TRADE_DAILY)

    # Arrivals only — represents imports landing in the destination country.
    arrivals = df[df["type"] == "arrival"].copy()
    arrivals["date"] = pd.to_datetime(arrivals["date"])
    arrivals["year"] = arrivals["date"].dt.year

    # Convert cbm → tonnes
    annual = (
        arrivals.groupby("year")["amount_cbm"].sum()
        .reset_index()
        .rename(columns={"amount_cbm": "lng_t3_cbm"})
    )
    annual["lng_t3_mt"] = annual["lng_t3_cbm"] * LNG_DENSITY_T_PER_CBM / 1e6

    print(f"{'Year':<6} {'LNG-T3 Mt':<12} {'GIIGNL Mt':<12} {'Δ Mt':<10} {'Gap %':<8}")
    print("-" * 50)
    failed = False
    for _, r in annual.iterrows():
        y = int(r["year"])
        t3 = float(r["lng_t3_mt"])
        gi = GIIGNL_MT_PER_YEAR.get(y)
        if gi is None:
            print(f"{y:<6} {t3:>10.1f}   (no GIIGNL reference)")
            continue
        diff = t3 - gi
        gap_pct = abs(diff) / gi * 100.0
        flag = "✗" if gap_pct > ACCEPTABLE_GAP_PCT else "✓"
        print(f"{y:<6} {t3:>10.1f}   {gi:>10.1f}   {diff:>+8.1f}   {gap_pct:>5.1f}%  {flag}")
        if gap_pct > ACCEPTABLE_GAP_PCT:
            failed = True

    if failed:
        print(
            f"\n✗ FAILED: at least one year exceeds {ACCEPTABLE_GAP_PCT}% gap vs GIIGNL.\n"
            f"  Per spec, this triggers escalation before merge. Either:\n"
            f"  - LNG-T3 under-reports (check filtering / density constant)\n"
            f"  - GIIGNL constants in this script are wrong (verify against latest report)\n"
            f"  - The dataset is unsuitable for the scenario refactor; consider keeping BACI",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"\n✓ All years within {ACCEPTABLE_GAP_PCT}% of GIIGNL public totals.")


if __name__ == "__main__":
    main()
