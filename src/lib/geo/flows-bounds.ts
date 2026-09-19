/**
 * Framing a focused country *and the partners its arcs reach* (Wave 2 polish
 * 1).
 *
 * `?mode=flows&focus=JPN` used to fit the camera to Japan, which is the S0
 * rule and the wrong answer here: the whole point of a focus in Flows is the
 * arcs, and every one of them leaves the frame immediately. At that zoom the
 * pixel-width arcs also converge on the country anchor and fuse into a wedge.
 *
 * So when the trade-flow layer is on, the fit is taken over the country's own
 * bounds **plus its largest partners' anchors**. Only the largest few: a
 * country with 100 partners reaches every continent, and including the tail
 * would fit to the whole world, which frames nothing.
 */
import type { Bounds } from "@/lib/state/camera";
import { countryAnchor } from "./country-anchors";
import { withMinimumExtent } from "./bounds";

/** How many of a focused country's partners the fit tries to include. */
export const FLOWS_FIT_PARTNERS = 5;

/**
 * Widest longitude span the partner-aware fit will produce. Past this the
 * result is indistinguishable from the world view, and the country — the
 * thing actually selected — is a speck in it, so we frame the country alone
 * and let the reader zoom out. 200° is a little over half the globe: Japan
 * with its Gulf suppliers (≈ 90°) fits comfortably, the USA with both
 * Atlantic and Pacific partners does not.
 */
export const FLOWS_FIT_MAX_SPAN_DEG = 200;

function union(a: Bounds, b: Bounds): Bounds {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/**
 * `country` grown to take in the anchors of `partners` (already ordered
 * largest first; only the first {@link FLOWS_FIT_PARTNERS} are used), or
 * `country` unchanged when the result would be wider than
 * {@link FLOWS_FIT_MAX_SPAN_DEG} or no partner has an anchor.
 *
 * Partner codes are whatever the trade data carries; one with no anchor is
 * skipped rather than treated as (0, 0).
 */
export function flowsFitBounds(
  country: Bounds,
  partners: readonly string[],
  limit: number = FLOWS_FIT_PARTNERS,
): Bounds {
  let out: Bounds | null = null;
  for (const iso3 of partners.slice(0, limit)) {
    const a = countryAnchor(iso3);
    if (a === undefined) continue;
    const point: Bounds = [a[0], a[1], a[0], a[1]];
    out = out === null ? point : union(out, point);
  }
  if (out === null) return country;
  const grown = union(country, out);
  if (grown[2] - grown[0] > FLOWS_FIT_MAX_SPAN_DEG) return country;
  return withMinimumExtent(grown);
}
