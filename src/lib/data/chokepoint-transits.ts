import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";

/**
 * IMF PortWatch daily chokepoint transits — observed traffic at the
 * chokepoints the scenarios close, shown beside a scenario as context and
 * never folded into its exposure figure (see ScenarioContext.tsx).
 *
 * Counts are **AIS-observed**: a ship sailing with its transponder off is not
 * counted, and in a conflict many do, so in exactly the months this matters
 * most the figure is a lower bound on real traffic. Every surface that shows
 * it says so.
 *
 * Like the GIE layer, this is independent of the selected year: it always
 * reads the latest 30 days PortWatch has published and says which days.
 */

/** Days averaged on each side of the comparison. */
export const TRANSIT_WINDOW_DAYS = 30;

/** A window counts only if PortWatch reports at least this many of its days. */
export const MIN_WINDOW_DAYS = 25;

export interface TransitRow {
  readonly scenario_id: string;
  readonly chokepoint: string;
  /** ISO date, "2026-10-11". */
  readonly date: string;
  readonly transits_all: number;
  readonly transits_tanker: number;
}

export interface TransitWindow {
  /** First and last ISO dates of the window. */
  readonly from: string;
  readonly through: string;
  /** Mean tankers a day over the days reported in the window. */
  readonly tankersPerDay: number;
  /** Mean vessels of every type a day. */
  readonly allPerDay: number;
  readonly days: number;
}

export interface ChokepointTransitSummary {
  readonly scenarioId: string;
  /** PortWatch's own name, "Strait of Hormuz". */
  readonly chokepoint: string;
  /** The latest 30 days PortWatch has published for this chokepoint. */
  readonly recent: TransitWindow;
  /** The same 30 calendar days one year earlier; null when too few days were reported. */
  readonly yearEarlier: TransitWindow | null;
  /** Tanker transits, recent vs a year earlier, %; null without a year-earlier window. */
  readonly tankerChangePct: number | null;
}

export type ChokepointTransits = ReadonlyMap<string, ChokepointTransitSummary>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function shiftYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function windowOf(rows: readonly TransitRow[], from: string, through: string): TransitWindow | null {
  let tankers = 0;
  let all = 0;
  let days = 0;
  for (const r of rows) {
    if (r.date < from || r.date > through) continue;
    tankers += r.transits_tanker;
    all += r.transits_all;
    days += 1;
  }
  if (days < MIN_WINDOW_DAYS) return null;
  return { from, through, tankersPerDay: tankers / days, allPerDay: all / days, days };
}

/** Per scenario id: the latest 30 days against the same 30 days a year earlier. Pure. */
export function summariseTransits(rows: readonly TransitRow[]): ChokepointTransits {
  const byScenario = new Map<string, TransitRow[]>();
  for (const r of rows) {
    let list = byScenario.get(r.scenario_id);
    if (!list) byScenario.set(r.scenario_id, (list = []));
    list.push(r);
  }
  const out = new Map<string, ChokepointTransitSummary>();
  for (const [scenarioId, list] of byScenario) {
    let latest = "";
    let chokepoint = "";
    for (const r of list) {
      if (r.date > latest) {
        latest = r.date;
        chokepoint = r.chokepoint;
      }
    }
    const from = shiftDays(latest, -(TRANSIT_WINDOW_DAYS - 1));
    const recent = windowOf(list, from, latest);
    if (recent === null) continue;
    const yearEarlier = windowOf(list, shiftYears(from, -1), shiftYears(latest, -1));
    const tankerChangePct =
      yearEarlier !== null && yearEarlier.tankersPerDay > 0
        ? ((recent.tankersPerDay - yearEarlier.tankersPerDay) / yearEarlier.tankersPerDay) * 100
        : null;
    out.set(scenarioId, { scenarioId, chokepoint, recent, yearEarlier, tankerChangePct });
  }
  return out;
}

export const loadChokepointTransits = cachedLoader(async (): Promise<ChokepointTransits> => {
  const rows = await readParquet<TransitRow>("/data/chokepoint_transits.parquet", [
    "scenario_id",
    "chokepoint",
    "date",
    "transits_all",
    "transits_tanker",
  ]);
  return summariseTransits(rows);
});
