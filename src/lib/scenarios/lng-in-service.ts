import type { LngImportRow, LngVoyageRow } from "./types";
import { isVisibleAtYear } from "@/lib/vintage/filter";

/** Voyages the LNG-T3 attribution uses (and so counts as evidence of service). */
export const LNG_T3_MIN_CONFIDENCE = 3;

export function isQualifyingVoyage(v: LngVoyageRow, minConfidence = LNG_T3_MIN_CONFIDENCE): boolean {
  return v.voyage_type === "export" && v.confidence_score >= minConfidence;
}

/**
 * Import terminals that could have received LNG in `year`, so the scenario
 * never attributes a country's imports to a plant that did not exist yet.
 *
 * A terminal counts when it took a qualifying cargo in `voyages` (already
 * filtered to the year) — observed service beats a listed start year, which
 * is sometimes the formal commissioning after months of commissioning
 * cargoes (Al Zour: cargoes 2021, listed 2022). Otherwise it must not be
 * "in-construction" and its `commissioned_year` must be unknown or ≤ `year`.
 */
export function lngTerminalsInService(
  terminals: readonly LngImportRow[],
  year: number,
  voyages: readonly LngVoyageRow[],
): LngImportRow[] {
  const served = new Set<string>();
  for (const v of voyages) {
    if (isQualifyingVoyage(v)) served.add(`${v.to_country_iso3} ${v.to_terminal}`);
  }
  return terminals.filter(
    (t) =>
      served.has(`${t.country_iso3} ${t.name}`) ||
      (t.status !== "in-construction" && isVisibleAtYear(t.commissioned_year, year)),
  );
}
