import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import type { Catalog } from "@/lib/data-catalog/types";
import { dataUrl, dataVersion, VERSION_LENGTH } from "@/lib/data/urls";
import nextConfig, { IMMUTABLE, REVALIDATE } from "../../../next.config";

const ROOT = join(__dirname, "..", "..", "..");
const SRC = join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("dataUrl (P5: deploy-scoped data URLs)", () => {
  it("versions every runtime catalog path with the first 8 hex chars of its sha256", () => {
    const runtime = BUNDLED_CATALOG.entries.filter((e) => e.runtime !== false);
    expect(runtime.length).toBeGreaterThan(0);
    for (const e of runtime) {
      expect(e.sha256, `${e.id} has no sha256`).toMatch(/^[0-9a-f]{64}$/);
      expect(dataUrl(e.path)).toBe(`${e.path}?v=${(e.sha256 ?? "").slice(0, VERSION_LENGTH)}`);
    }
  });

  it("reads hashes generically from whatever catalog it is given", () => {
    const cat: Catalog = {
      version: 6,
      generated_at: "2026-01-01",
      entries: [
        {
          id: "x",
          label: "x",
          path: "/data/new_file.parquet",
          format: "parquet",
          source_name: "s",
          source_url: "u",
          license: "l",
          as_of: "2026-01-01",
          layers: [],
          sha256: "abcdef0123456789".padEnd(64, "0"),
        },
      ],
    };
    expect(dataUrl("/data/new_file.parquet", cat)).toBe("/data/new_file.parquet?v=abcdef01");
    expect(dataVersion("/data/other.parquet", cat)).toBeNull();
  });

  it("leaves an uncatalogued path unversioned (served revalidate, never immutable)", () => {
    expect(dataUrl("/data/nope.geojson")).toBe("/data/nope.geojson");
  });
});

describe("every runtime data URL goes through the versioning helper", () => {
  const files = sourceFiles(SRC);

  it("no source file fetches a /data/ path directly", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      // fetch("/data/…"), fetch(`/data/…`), fetch('/data/…') — catalog.json excepted
      for (const m of text.matchAll(/fetch\(\s*[`'"]([^`'"]*\/data\/[^`'"]*)[`'"]/g)) {
        if (!m[1]?.endsWith("/data/catalog.json")) offenders.push(`${relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every hardcoded /data/*.parquet|geojson path used at runtime has a catalog hash", () => {
    const missing: string[] = [];
    for (const f of files) {
      if (f.includes(join("src", "app", "data"))) continue; // download links, not runtime reads
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/['"`](\/data\/[A-Za-z0-9_.-]+\.(?:parquet|geojson))['"`]/g)) {
        const p = m[1] ?? "";
        if (dataVersion(p) === null) missing.push(`${relative(ROOT, f)}: ${p}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("next.config.ts cache headers", () => {
  it("is immutable only for versioned /data and /duckdb URLs", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    for (const prefix of ["/data/:path*", "/duckdb/:path*"]) {
      const mine = rules.filter((r) => r.source === prefix);
      const withV = mine.find((r) => r.has?.some((h) => h.type === "query" && h.key === "v"));
      const withoutV = mine.find((r) => r.missing?.some((h) => h.type === "query" && h.key === "v"));
      expect(withV?.headers).toEqual([{ key: "Cache-Control", value: IMMUTABLE }]);
      expect(withoutV?.headers).toEqual([{ key: "Cache-Control", value: REVALIDATE }]);
    }
    expect(IMMUTABLE).toBe("public, max-age=31536000, immutable");
  });
});
