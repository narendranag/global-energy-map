import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import type { Catalog } from "@/lib/data-catalog/types";

/**
 * Deploy-scoped data URLs (Phase 10, P5).
 *
 * `/data/*` is served `Cache-Control: public, max-age=31536000, immutable`
 * when the request carries `?v=` (see next.config.ts). That is only safe if
 * `v` changes whenever the bytes change, so the version is the first 8 hex
 * chars of the file's `sha256` in `catalog.json` — the catalog is used for
 * the hash only; logical paths stay hardcoded at the call site (CLAUDE.md).
 *
 * A path with no catalog hash comes back unversioned, which next.config.ts
 * serves `max-age=0, must-revalidate` — never a stale year-long cache.
 */

/** Length of the sha256 prefix used as the version token. */
export const VERSION_LENGTH = 8;

function buildIndex(catalog: Catalog): ReadonlyMap<string, { sha: string; bytes: number | undefined }> {
  const m = new Map<string, { sha: string; bytes: number | undefined }>();
  for (const e of catalog.entries) {
    if (e.sha256 && !m.has(e.path)) m.set(e.path, { sha: e.sha256, bytes: e.bytes });
  }
  return m;
}

const BUNDLED_INDEX = buildIndex(BUNDLED_CATALOG);

function indexFor(catalog: Catalog | undefined) {
  return catalog === undefined ? BUNDLED_INDEX : buildIndex(catalog);
}

/** The `?v=` token for a `/data/...` path, or null when the catalog has no hash for it. */
export function dataVersion(path: string, catalog?: Catalog): string | null {
  const hit = indexFor(catalog).get(path);
  return hit ? hit.sha.slice(0, VERSION_LENGTH) : null;
}

/** Size in bytes the catalog records for a `/data/...` path, or null. */
export function dataBytes(path: string, catalog?: Catalog): number | null {
  return indexFor(catalog).get(path)?.bytes ?? null;
}

/**
 * `/data/assets.parquet` → `/data/assets.parquet?v=c1710228`. Every runtime
 * fetch of a data file (parquet reads, GeoJSON sidecars) goes through
 * this; a unit test enforces it.
 */
export function dataUrl(path: string, catalog?: Catalog): string {
  const v = dataVersion(path, catalog);
  return v === null ? path : `${path}?v=${v}`;
}
