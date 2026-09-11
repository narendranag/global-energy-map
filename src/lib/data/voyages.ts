import type { LngVoyageRow } from "@/lib/scenarios/types";
import type { LngTerminalAsset } from "./assets";
import { cachedLoader } from "./cache";
import { readParquet } from "./parquet";

/** LNG-T3 voyage coverage; outside it there are no voyage rows. */
export const LNG_T3_FIRST_YEAR = 2020;
export const LNG_T3_LAST_YEAR = 2024;
/** Voyages below this LNG-T3 confidence score (1–5) are not shown or counted. */
export const MIN_VOYAGE_CONFIDENCE = 3;

export function voyagesInRange(year: number): boolean {
  return year >= LNG_T3_FIRST_YEAR && year <= LNG_T3_LAST_YEAR;
}

/** A loaded-cargo voyage row, as the map layer and the scenario engine read it. */
export interface VoyageRow extends LngVoyageRow {
  readonly voyage_id: string;
  readonly from_country: string;
  readonly to_country: string;
}

export interface PositionedVoyage extends VoyageRow {
  readonly from_lon: number;
  readonly from_lat: number;
  readonly to_lon: number;
  readonly to_lat: number;
}

/**
 * Export (laden) voyages with confidence >= MIN_VOYAGE_CONFIDENCE active
 * during `year` (start year <= year <= end year). Shared by the voyages
 * layer and the Hormuz-LNG scenario so both count the same voyages; outside
 * the LNG-T3 range it resolves to [] without querying.
 */
const VOYAGE_COLUMNS = [
  "voyage_id", "start_date", "end_date", "imo", "voyage_type", "from_terminal", "to_terminal",
  "from_country", "to_country", "from_country_iso3", "to_country_iso3", "amount_cbm",
  "confidence_score",
] as const;

type VoyageFileRow = Omit<VoyageRow, "amount_cbm"> & { readonly amount_cbm: number | null };

/** "YYYY-MM-DD" → YYYY. */
const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));

export const loadVoyages = cachedLoader(async (year: number): Promise<readonly VoyageRow[]> => {
  if (!voyagesInRange(year)) return [];
  const rows = await readParquet<VoyageFileRow>("/data/lng_voyage.parquet", VOYAGE_COLUMNS);
  return rows
    .filter(
      (v) =>
        v.voyage_type === "export" &&
        v.confidence_score >= MIN_VOYAGE_CONFIDENCE &&
        yearOf(v.start_date) <= year &&
        yearOf(v.end_date) >= year,
    )
    .map((v) => ({ ...v, amount_cbm: v.amount_cbm ?? 0 }));
});

/**
 * Terminal name → [lon, lat]. Terminal name is the join key between voyages
 * and terminal rows (CLAUDE.md). A name can appear twice (an export and an
 * import berth at one site, or an LNG-T3 row plus a GEM supplement row);
 * LNG-T3 coordinates win, otherwise the first row.
 */
export function terminalCoordinates(
  terminals: readonly LngTerminalAsset[],
): ReadonlyMap<string, readonly [number, number]> {
  const out = new Map<string, readonly [number, number]>();
  const fromLngT3 = new Set<string>();
  for (const t of terminals) {
    const isLngT3 = t.source?.includes("LNG-T3") ?? false;
    if (!out.has(t.name) || (isLngT3 && !fromLngT3.has(t.name))) {
      out.set(t.name, [t.lon, t.lat]);
      if (isLngT3) fromLngT3.add(t.name);
    }
  }
  return out;
}

/** Attach both ends' coordinates; voyages with an unresolved end are dropped. */
export function positionVoyages(
  voyages: readonly VoyageRow[],
  coords: ReadonlyMap<string, readonly [number, number]>,
): PositionedVoyage[] {
  const out: PositionedVoyage[] = [];
  for (const v of voyages) {
    const from = coords.get(v.from_terminal);
    const to = coords.get(v.to_terminal);
    if (!from || !to) continue;
    out.push({ ...v, from_lon: from[0], from_lat: from[1], to_lon: to[0], to_lat: to[1] });
  }
  return out;
}
