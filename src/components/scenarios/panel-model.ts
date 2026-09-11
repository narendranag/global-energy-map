/**
 * Pure helpers behind the scenario panel (sorting, units, provenance rows).
 * No React — unit-tested in tests/unit/scenarios/panel-model.test.ts.
 */
import type {
  Commodity,
  DisruptionRouteRow,
  ImporterImpact,
  LngImportImpact,
  ScenarioId,
} from "@/lib/scenarios/types";
import { BARRELS_PER_TONNE_CRUDE } from "@/lib/scenarios/registry";
import { groupIdenticalPairShares, pairLabel } from "@/lib/scenarios/share-groups";
import { isUnsourced, type RouteShareRow } from "@/lib/data/scenario-inputs";

export type ImporterSort = "share" | "volume";

/** Rows shown before the "Show all" expander. */
export const TOP_N = 6;

/**
 * Re-order an already-filtered importer ranking (see `rankImportersByShare`)
 * by the chosen column. "share" keeps the displayed %; "volume" sorts by
 * volume at risk, share as the tie-break.
 */
export function sortImporters(
  ranked: readonly ImporterImpact[],
  by: ImporterSort,
): ImporterImpact[] {
  const out = [...ranked];
  if (by === "share") {
    out.sort((a, b) => b.shareAtRisk - a.shareAtRisk || b.atRiskQty - a.atRiskQty);
  } else {
    out.sort((a, b) => b.atRiskQty - a.atRiskQty || b.shareAtRisk - a.shareAtRisk);
  }
  return out;
}

/** BACI tonnes per year → thousand barrels per day (crude). */
export function tonnesToKbd(tonnesPerYear: number): number {
  return (tonnesPerYear * BARRELS_PER_TONNE_CRUDE) / 365 / 1000;
}

function fmt(n: number, digits: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Unit label for volumes in the panel. */
export function volumeUnit(commodity: Commodity): string {
  return commodity === "gas" ? "Mt" : "kb/d";
}

/** Number part of a BACI annual volume in the panel's unit (kb/d crude, Mt LNG). */
export function formatVolumeNumber(tonnesPerYear: number, commodity: Commodity): string {
  if (commodity === "gas") {
    const mt = tonnesPerYear / 1e6;
    return fmt(mt, mt < 1 ? 2 : 1);
  }
  const kbd = tonnesToKbd(tonnesPerYear);
  return fmt(kbd, kbd < 10 ? 1 : 0);
}

/** "123 kb/d" / "4.5 Mt" from BACI tonnes per year. */
export function formatVolume(tonnesPerYear: number, commodity: Commodity): string {
  return `${formatVolumeNumber(tonnesPerYear, commodity)} ${volumeUnit(commodity)}`;
}

/** "64.3%" */
export function pct(t: number): string {
  return `${(t * 100).toFixed(1)}%`;
}

/** Route shares are hand-set: "88%", "3.5%". */
export function sharePct(share: number): string {
  const p = share * 100;
  return `${p < 10 && !Number.isInteger(p) ? p.toFixed(1) : p.toFixed(0)}%`;
}

/** Capacity at risk (share × capacity) in the asset's own unit (kbpd / mtpa). */
export function capacityAtRisk(a: { shareAtRisk: number; capacity: number | null | undefined }): number {
  return a.shareAtRisk * (a.capacity ?? 0);
}

export function formatCapacity(n: number): string {
  return fmt(n, n < 10 ? 1 : 0);
}

/** Per-terminal LNG attribution provenance, for the asset list badge. */
export function coverageLabel(coverage: LngImportImpact["coverage"]): {
  readonly text: string;
  readonly title: string;
} {
  switch (coverage) {
    case "measured":
      return {
        text: "measured",
        title: "Share and supplier mix from LNG-T3 voyages to this terminal, scaled to the BACI country total.",
      };
    case "capacity-proxy":
      return {
        text: "capacity proxy",
        title: "No voyage coverage in this country: BACI country total split across terminals by capacity.",
      };
    case "none":
      return {
        text: "no voyages",
        title: "The country has voyage coverage, but none to this terminal — a data gap, not a real zero.",
      };
  }
}

/** A route share row ready to render, citation fields defaulted. */
export interface RouteDisplayRow {
  readonly key: string;
  readonly exporter: string;
  /** null = all importers of this exporter */
  readonly importer: string | null;
  readonly share: number;
  readonly title: string;
  readonly url: string;
  readonly year: number | null;
  readonly note: string;
  readonly unsourced: boolean;
  /** Set when identical pair rows are listed as one entry: ["IRN→IRQ", …]. */
  readonly pairs: readonly string[] | null;
}

type CitedRoute = DisruptionRouteRow & Partial<Omit<RouteShareRow, keyof DisruptionRouteRow>>;

/**
 * The route shares the active scenario uses, with their citations, highest
 * share first. Rows without a citation title count as unsourced too. Pair
 * rows with the same share and citation (the share-0 intra-Gulf Hormuz
 * pairs) collapse into one entry.
 */
export function routeRowsForDisplay(
  routes: readonly CitedRoute[],
  scenarioId: ScenarioId,
): RouteDisplayRow[] {
  return groupIdenticalPairShares(routes.filter((r) => r.disruption_id === scenarioId))
    .map(({ rows }) => {
      const r = rows[0];
      const title = r.source_title ?? "";
      const grouped = rows.length > 1;
      return {
        key: grouped ? `group:${pairLabel(r)}` : pairLabel(r),
        exporter: r.exporter_iso3,
        importer: r.importer_iso3,
        pairs: grouped ? rows.map(pairLabel) : null,
        share: r.share,
        title,
        url: r.source_url ?? "",
        year: r.source_year ?? null,
        note: r.source_note ?? "",
        unsourced: title === "" || isUnsourced({ source_title: title }),
      };
    })
    .sort((a, b) => b.share - a.share || a.key.localeCompare(b.key));
}
