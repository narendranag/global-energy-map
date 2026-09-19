import type { NextConfig } from "next";

/**
 * Phase 10 (P5): runtime data and the self-hosted DuckDB bundle are fetched
 * through versioned URLs (`?v=<sha8>` from catalog.json for /data, the
 * DuckDB package version for /duckdb — see src/lib/data/urls.ts and
 * src/lib/duckdb/bundles.ts). A versioned URL names immutable bytes, so it
 * is cached for a year; the same path without `?v=` (download links on
 * /data, catalog.json, anything uncatalogued) must revalidate every time.
 */
export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "public, max-age=0, must-revalidate";

const VERSIONED = [{ type: "query" as const, key: "v" }];

function cacheRules(source: string) {
  return [
    { source, has: VERSIONED, headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
    { source, missing: VERSIONED, headers: [{ key: "Cache-Control", value: REVALIDATE }] },
  ];
}

/** Canonical public origin (Phase 10 launch). */
export const CANONICAL_ORIGIN = "https://energymap.marain.space";
/** The Phase 1–10 production alias; permanently redirected so old links and citations resolve. */
export const LEGACY_HOST = "global-energy-map-one.vercel.app";

const nextConfig: NextConfig = {
  redirects() {
    return Promise.resolve([
      // Phase 9: /about became /methodology. Permanent so old links keep resolving.
      { source: "/about", destination: "/methodology", permanent: true },
      // Launch: the vercel.app alias → the custom domain, path and query kept.
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: LEGACY_HOST }],
        destination: `${CANONICAL_ORIGIN}/:path*`,
        permanent: true,
      },
    ]);
  },
  headers() {
    return Promise.resolve([
      ...cacheRules("/data/:path*"),
      ...cacheRules("/duckdb/:path*"),
      // S7 (embed mode): nothing here ever set X-Frame-Options or a CSP
      // frame-ancestors directive, so a third-party <iframe> could already
      // embed *any* route, not just the one designed for it (A9). `/` is the
      // public, read-only map (no accounts, no forms) — the one page meant to
      // be framed — so it keeps `frame-ancestors *`. Every other page-y route
      // gets `frame-ancestors 'none'` explicitly, rather than leaving them to
      // whatever the platform's unstated default is.
      //
      // These sources are exact paths, not `/data/:path*` (a Next `:path*` is
      // an *optional* catch-all — it also matches the bare `/data` page — so
      // reusing it here would layer a second header rule onto every
      // `/data/*.parquet` / `/data/*.geojson` download too). Scoping to the
      // literal page path keeps this off the static file responses the cache
      // rules above already own.
      {
        source: "/",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      ...["/query", "/data", "/methodology", "/terms", "/privacy"].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      })),
    ]);
  },
};

export default nextConfig;
