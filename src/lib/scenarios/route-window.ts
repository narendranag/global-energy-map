/**
 * The trade years a `disruption_route` row holds for (2026-10-24).
 *
 * `valid_from_year` / `valid_to_year` are inclusive; null or absent = open on
 * that side, which is every row except where a route changed inside the years
 * we hold (Kirkuk-Ceyhan shut 2023–2025, and the Hormuz Iraq share that is its
 * complement). Such a key is split into rows whose windows never overlap —
 * build_disruption_routing.py refuses an overlap — so after this filter a
 * key has at most one row for any year, and the share resolver's
 * "one row per key" assumption holds.
 */
export interface RouteWindow {
  readonly valid_from_year?: number | null;
  readonly valid_to_year?: number | null;
}

/** True when the row's share holds in trade year `year`. */
export function isRouteValidAt(row: RouteWindow, year: number): boolean {
  const from = row.valid_from_year ?? null;
  const to = row.valid_to_year ?? null;
  return (from === null || year >= from) && (to === null || year <= to);
}

/** True when the row holds only for some years (either end is set). */
export function isWindowed(row: RouteWindow): boolean {
  return (row.valid_from_year ?? null) !== null || (row.valid_to_year ?? null) !== null;
}

/**
 * The window in words, for the citation lists: "through 2022", "2023–2025",
 * "from 2026"; "" for a row that holds every year.
 */
export function routeWindowLabel(row: RouteWindow): string {
  const from = row.valid_from_year ?? null;
  const to = row.valid_to_year ?? null;
  if (from === null && to === null) return "";
  if (from === null) return `through ${String(to)}`;
  if (to === null) return `from ${String(from)}`;
  return from === to ? String(from) : `${String(from)}–${String(to)}`;
}
