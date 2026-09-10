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

const nextConfig: NextConfig = {
  // Phase 9: /about became /methodology (sources, coverage, scenario method,
  // how to cite). Permanent so old links and citations keep resolving.
  redirects() {
    return Promise.resolve([{ source: "/about", destination: "/methodology", permanent: true }]);
  },
  headers() {
    return Promise.resolve([...cacheRules("/data/:path*"), ...cacheRules("/duckdb/:path*")]);
  },
};

export default nextConfig;
