/**
 * Pure model behind the scenario panel's "Context" block (T3, post-launch
 * UX plan): ties the two live, view-only layers (EU gas storage, UN
 * Comtrade recent imports) to an active LNG scenario's result. No React —
 * unit-tested in tests/unit/scenarios/context-model.test.ts.
 *
 * Both inputs are honesty checks, never a recomputed exposure figure:
 *  - Storage is a **stock** that serves *all* gas demand, not just the LNG
 *    at risk from one chokepoint; "days of cover" below is a scale
 *    comparison, not a forecast of how long a country could actually last.
 *  - Comtrade is a recency **check** against the BACI figure the scenario
 *    already used, never a second exposure computation — see
 *    `src/lib/data/recent-imports.ts` for why it can't be one (importer
 *    totals only, as-reported, not reconciled).
 */
import type { GasStorageByCountry } from "@/lib/data/gas-storage";
import { divergesFromBaci, isComplete, type RecentImportsData } from "@/lib/data/recent-imports";
import type { Commodity, ScenarioId, ScenarioResult } from "@/lib/scenarios/types";
import type { ScenarioView } from "@/lib/url-state/encode";

/**
 * Energy content of LNG, used only to put the scenario engine's at-risk
 * tonnage (BACI mass) on the same footing as AGSI's gas-in-storage reading
 * (energy, TWh) — a unit conversion, not a claim about how much of that gas
 * physically reaches any one country's storage.
 *
 * AGSI publishes `gasInStorage` on a **gross calorific value (GCV / higher
 * heating value)** basis — the JRC's own AGSI-derived storage tables state a
 * "unified gross calorific value ... used to convert energy" (European
 * Commission JRC, *Cost-Benefit Analysis of the EU Gas Storage Regulation*,
 * JRC132366, 2022, table note 1). Matching that GCV stock therefore needs a
 * **GCV-basis** figure for LNG's energy content, not a net/lower-heating-value
 * (LHV/NCV) one — the two differ by ~8% for LNG, which is exactly the size of
 * this bug.
 *
 * The IGU's own conversion tables (International Gas Union, *Natural Gas
 * Conversion Guide/Pocketbook*, 2012) give LNG at **53.38 mmBtu/t (gross)**
 * (the pocketbook's inter-fuel table prints 53.4 mmBtu/t gross; GIIGNL's
 * industry figures round the same value). Converting:
 *   53.38 mmBtu/t × 1.055056 GJ/mmBtu = 56.319 GJ/t (GCV)
 *   56.319 GJ/t × 1e6 t/Mt ÷ 3.6e6 GJ/TWh = **15.644 TWh per million tonnes (Mt)**
 *
 * The constant this replaced (14.447 TWh/Mt, from 52 GJ/t) was mislabelled
 * HHV in this file's own comment but is in fact a **net/LHV** figure (LNG's
 * LHV runs ~52 GJ/t; its GCV is ~56 GJ/t) — a stock/flow basis mismatch
 * against AGSI's GCV-basis reading. Fixed 2026-09-19; see
 * `docs/superpowers/research/final-review-findings.md` finding #1.
 */
export const TWH_PER_MT_LNG = 15.644;

export function mtToTwh(mt: number): number {
  return mt * TWH_PER_MT_LNG;
}

/**
 * Chokepoint scenarios with an LNG axis — the set whose gas-commodity result
 * carries a defined "LNG at risk" (see `commodities` in registry.ts; the
 * pipeline scenarios never include "gas").
 */
export const LNG_STORAGE_SCENARIOS: readonly ScenarioId[] = [
  "hormuz",
  "malacca",
  "suez",
  "bab_el_mandeb",
];

export function isLngStorageScenario(id: ScenarioId): boolean {
  return LNG_STORAGE_SCENARIOS.includes(id);
}

/** True when the storage-cover block has anything to compute for this result. */
export function showsStorageContext(result: Pick<ScenarioResult, "commodity" | "scenarioId">): boolean {
  return result.commodity === "gas" && isLngStorageScenario(result.scenarioId);
}

/**
 * The Context block's own honesty caveats (final review #10): every number
 * it shows is read straight off `result` and `view`, so the caption below it
 * must say, in the same breath, whatever would otherwise make the number
 * misleading on its own —
 *  - **severity** below 100 % is not the full closure every figure elsewhere
 *    implies by default;
 *  - a **combined** result (two scenarios closed together) is the lower
 *    bound of a range, not a single measured number;
 *  - in **exporter view** the rows shown here are still importers (gas
 *    storage and Comtrade recency are inherently importer-side concepts),
 *    which would otherwise look like it silently ignored the toggle above it.
 *
 * Returns null when none of these apply, so the caption line does not print
 * at severity 100 %, single-scenario, importer view — the common case.
 */
export function contextCaption(
  result: Pick<ScenarioResult, "severity" | "scenarioIds">,
  view: ScenarioView,
): string | null {
  const parts: string[] = [];
  const severity = result.severity ?? 1;
  if (severity < 1) parts.push(`at ${Math.round(severity * 100).toString()}% severity`);
  if ((result.scenarioIds?.length ?? 1) > 1) {
    parts.push("the lower bound of the combined range shown above");
  }
  if (view === "exporters") {
    parts.push("importers exposed by this closure, not the exporters ranked above");
  }
  if (parts.length === 0) return null;
  return `Figures below are ${parts.join(", and ")}.`;
}

export interface StorageContextRow {
  readonly iso3: string;
  /** BACI at-risk LNG, million tonnes, for `baciYear`. */
  readonly atRiskMt: number;
  /** `atRiskMt` converted to TWh/year — see `TWH_PER_MT_LNG`. */
  readonly atRiskTwhPerYear: number;
  /** AGSI gas in storage, TWh, on `gasDay` (that country's own latest day). */
  readonly storageTwh: number;
  /** AGSI fullness, %. Can exceed 100 — not clamped (see CLAUDE.md). */
  readonly storagePctFull: number;
  readonly gasDay: string;
  /** storageTwh ÷ (atRiskTwhPerYear ÷ 365) — a scale comparison, not a forecast. */
  readonly daysOfCover: number;
  /** The BACI year the scenario computed exposure for. */
  readonly baciYear: number;
}

/**
 * One row per country the scenario found exposed (`atRiskQty > 0`) *and*
 * GIE covers with a current reading. A country GIE does not cover, or with
 * no exposure, simply does not appear — including landlocked countries with
 * storage but no LNG imports (they never have `atRiskQty > 0` here).
 */
export function buildStorageContextRows(
  result: Pick<ScenarioResult, "commodity" | "scenarioId" | "byImporter" | "year">,
  storage: GasStorageByCountry,
): readonly StorageContextRow[] {
  if (!showsStorageContext(result)) return [];
  const rows: StorageContextRow[] = [];
  for (const imp of result.byImporter) {
    if (!(imp.atRiskQty > 0)) continue;
    const reading = storage.get(imp.iso3);
    if (reading === undefined) continue;
    const atRiskMt = imp.atRiskQty / 1e6;
    const atRiskTwhPerYear = mtToTwh(atRiskMt);
    // atRiskMt > 0 is guaranteed by the loop filter above, so dailyAtRiskTwh
    // is always strictly positive — no non-finite / zero-division case here.
    const dailyAtRiskTwh = atRiskTwhPerYear / 365;
    const daysOfCover = reading.twh / dailyAtRiskTwh;
    rows.push({
      iso3: imp.iso3,
      atRiskMt,
      atRiskTwhPerYear,
      storageTwh: reading.twh,
      storagePctFull: reading.pctFull,
      gasDay: reading.gasDay,
      daysOfCover,
      baciYear: result.year,
    });
  }
  return rows.sort((a, b) => b.atRiskMt - a.atRiskMt);
}

export interface RecentImportsContextRow {
  readonly iso3: string;
  readonly commodity: Commodity;
  /** The BACI figure the scenario itself used (that importer's total for `baciYear`), Mt. */
  readonly baciMt: number;
  readonly baciYear: number;
  /** Comtrade total over its own window, Mt; null = no monthly reports at all (China, Taiwan). */
  readonly comtradeMt: number | null;
  readonly from: string | null;
  readonly through: string | null;
  readonly complete: boolean;
  readonly diverges: boolean;
}

/**
 * A recency check beside the top exposed importers, in the same ranking the
 * panel already shows — **never** a second exposure computation: Comtrade
 * here is importer totals only (see recent-imports.ts on why partner detail,
 * where it exists, still isn't used for a baseline).
 */
export function buildRecentImportsContextRows(
  result: Pick<ScenarioResult, "commodity" | "byImporter" | "year">,
  recent: RecentImportsData,
  topN: number,
): readonly RecentImportsContextRow[] {
  const top = [...result.byImporter]
    .filter((i) => i.atRiskQty > 0)
    .sort((a, b) => b.atRiskQty - a.atRiskQty)
    .slice(0, topN);
  return top.map((imp) => {
    const r = recent.byIso3.get(imp.iso3);
    return {
      iso3: imp.iso3,
      commodity: result.commodity,
      baciMt: imp.totalQty / 1e6,
      baciYear: result.year,
      comtradeMt: r ? r.mt : null,
      from: r?.from ?? null,
      through: r?.through ?? null,
      complete: r ? isComplete(r) : false,
      diverges: r ? divergesFromBaci(r) : false,
    };
  });
}
