/**
 * What the Cloudflare Worker (`cloudflare/worker.mjs`) does to the static files
 * it serves itself: `/data/*` and `/duckdb/*`. Pure, so Vitest covers it
 * without a Worker runtime.
 *
 * On Vercel, `next.config.ts` set these headers. On Workers the files in
 * `public/` are served from the asset store before Next ever runs, so its
 * `headers()` never sees them, and `_headers` cannot match on a query string.
 * The Worker therefore runs first for these two paths (`run_worker_first` in
 * wrangler.jsonc) and applies the same rule: a versioned URL (`?v=`) names
 * immutable bytes and is cached for a year; the same path without it
 * revalidates every time.
 */

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "public, max-age=0, must-revalidate";

/** Path prefixes the Worker handles before the asset store. Keep in sync with `run_worker_first`. */
export const WORKER_FIRST_PREFIXES = ["/data/", "/duckdb/"] as const;

export function cacheControlFor(url: URL): string {
  return url.searchParams.has("v") ? IMMUTABLE : REVALIDATE;
}

/**
 * The two DuckDB wasm modules are over Workers' 25 MiB per-asset limit, so
 * they live in R2 and the Worker streams them from the same origin (the
 * /query console still contacts no other host). Keyed by package version, so
 * a deploy never changes the bytes an older page's `?v=` asked for.
 * Returns null for any other path.
 */
export function duckdbWasmKey(url: URL, currentVersion: string): string | null {
  const file = /^\/duckdb\/(duckdb-(?:eh|mvp)\.wasm)$/.exec(url.pathname)?.[1];
  if (!file) return null;
  const version = url.searchParams.get("v") ?? currentVersion;
  if (!/^\d[0-9A-Za-z.+-]*$/.test(version)) return null;
  return `duckdb/${version}/${file}`;
}

export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

/**
 * Parse a single-range `Range: bytes=…` header against a body of `size`
 * bytes. Returns null for no header or a form we don't serve (multi-range),
 * and "unsatisfiable" for a range that starts past the end.
 */
export function parseRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (a === "") {
    const suffix = Number(b);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(a);
  if (start >= size) return "unsatisfiable";
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (end < start) return null;
  return { start, end };
}
