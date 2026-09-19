/**
 * Pure helpers behind the scenario panel (sorting, units, provenance rows).
 * No React — unit-tested in tests/unit/scenarios/panel-model.test.ts.
 */
import type {
  Commodity,
  ImporterImpact,
  LngImportImpact,
  RouteRow,
  ScenarioId,
} from "@/lib/scenarios/types";
import {
  BARRELS_PER_TONNE_CRUDE,
  getScenario,
  type HowComputedOptions,
} from "@/lib/scenarios/registry";
import { scenarioIdsOf } from "@/lib/scenarios/shares";
import type { ScenarioView } from "@/lib/url-state/encode";
import { groupIdenticalPairShares, pairLabel } from "@/lib/scenarios/share-groups";
import { isUnsourced, type RouteCitation } from "@/lib/data/scenario-inputs";

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

/**
 * The displayed figure for a country row.
 *
 * With one scenario there is one number. With two, the engine reports a range
 * (see `combineShares`): the headline is always the **lower** bound, and the
 * range is shown only when the two ends actually differ — routes in series
 * (the same barrels cross both) collapse to a single number and printing
 * "61.9–61.9 %" would invent an uncertainty that is not there.
 *
 * The comparison is on the *rendered* strings, not the raw floats, so a
 * difference too small to print never shows as a range.
 */
export function rangeLabel(
  lower: number,
  upper: number | undefined,
  format: (n: number) => string,
): string {
  const lo = format(lower);
  if (upper === undefined || upper <= lower) return lo;
  const hi = format(upper);
  return lo === hi ? lo : `${lo}–${hi}`;
}

/** The same rule for a percentage pair: "61.9%" or "61.9–78.0%". */
export function pctRange(r: { shareAtRisk: number; shareAtRiskUpper?: number }): string {
  return rangeLabel(r.shareAtRisk, r.shareAtRiskUpper, pct);
}

/** …and for a volume pair, with the unit printed once: "1.2–1.9 Mt". */
export function volumeRange(
  r: { atRiskQty: number; atRiskQtyUpper?: number },
  commodity: Commodity,
): string {
  const n = rangeLabel(r.atRiskQty, r.atRiskQtyUpper, (v) =>
    formatVolumeNumber(v, commodity),
  );
  return `${n} ${volumeUnit(commodity)}`;
}

/** True when any row in the list actually spans a range worth printing. */
export function hasRange(
  rows: readonly { shareAtRisk: number; shareAtRiskUpper?: number }[],
): boolean {
  return rows.some((r) => pctRange(r).includes("–"));
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
  /** null = the importer-wide (inbound) wildcard: "whatever this country imports". */
  readonly exporter: string | null;
  /** null = all importers of this exporter */
  readonly importer: string | null;
  readonly share: number;
  /** Which scenario the row belongs to — shown only when two are combined. */
  readonly scenarioId: ScenarioId;
  readonly title: string;
  readonly url: string;
  readonly year: number | null;
  readonly note: string;
  readonly unsourced: boolean;
  /** Set when identical pair rows are listed as one entry: ["IRN→IRQ", …]. */
  readonly pairs: readonly string[] | null;
}

type CitedRoute = RouteRow & Partial<RouteCitation>;

/**
 * The route shares a run uses, with their citations, highest share first.
 * Rows without a citation title count as unsourced too. Pair rows with the
 * same share and citation (the share-0 intra-Gulf Hormuz pairs) collapse into
 * one entry.
 *
 * `scenarioIds` is every scenario in the run (T1): with two combined, both
 * scenarios' rows are listed, each tagged with the scenario it came from —
 * a CSV or a panel quoting one scenario's shares under a two-scenario number
 * would not say where that number came from.
 */
export function routeRowsForDisplay(
  routes: readonly CitedRoute[],
  scenarioIds: ScenarioId | readonly ScenarioId[],
): RouteDisplayRow[] {
  const ids: readonly ScenarioId[] = typeof scenarioIds === "string" ? [scenarioIds] : scenarioIds;
  return ids
    .flatMap((id) =>
      groupIdenticalPairShares(routes.filter((r) => r.disruption_id === id)).map(({ rows }) => {
        const r = rows[0];
        const title = r.source_title ?? "";
        const grouped = rows.length > 1;
        const label = pairLabel(r);
        return {
          key: `${id}:${grouped ? `group:${label}` : label}`,
          scenarioId: id,
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
      }),
    )
    .sort((a, b) => b.share - a.share || a.key.localeCompare(b.key));
}

/**
 * The options `howComputed` must be told about, **derived** from the result
 * the panel is showing and the rows it was computed from (review finding 2).
 *
 * Nothing here is passed down from the UI's own state: severity, the scenario
 * set and the presence of inbound rows all come off the `ScenarioResult` and
 * its inputs, so the disclosure describes the numbers on screen rather than
 * whatever the controls happened to be set to while a result was loading. The
 * scenario list is deduped by `scenarioIdsOf` (finding 6), so a scenario
 * chosen twice reads as one closure, which is what it is.
 *
 * `view` is the one genuinely presentational input: which side the panel is
 * listing is a choice about reading, not about the computation.
 */
export function howComputedOptionsFor(
  result: { readonly scenarioId: ScenarioId; readonly scenarioIds?: readonly ScenarioId[]; readonly severity?: number } | null,
  routes: readonly Pick<RouteRow, "exporter_iso3">[] | null,
  view: ScenarioView,
): HowComputedOptions {
  return {
    severity: result?.severity ?? 1,
    combinedWith: result === null ? [] : scenarioIdsOf(result).map((id) => getScenario(id)),
    view: view === "exporters" ? "exporter" : "importer",
    hasInboundRoutes: routes?.some((r) => r.exporter_iso3 === null) ?? false,
  };
}
