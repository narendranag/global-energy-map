import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMMUTABLE,
  REVALIDATE,
  WORKER_FIRST_PREFIXES,
  cacheControlFor,
  duckdbWasmKey,
  parseRange,
} from "@/lib/edge/static";

const u = (p: string) => new URL(p, "https://energymap.marain.space");
const root = path.resolve(__dirname, "../../..");

describe("cacheControlFor", () => {
  it("caches versioned URLs for a year and revalidates the rest", () => {
    expect(cacheControlFor(u("/data/trade_flow.parquet?v=abcd1234"))).toBe(IMMUTABLE);
    expect(cacheControlFor(u("/data/trade_flow.parquet"))).toBe(REVALIDATE);
    expect(cacheControlFor(u("/data/catalog.json"))).toBe(REVALIDATE);
  });
});

describe("duckdbWasmKey", () => {
  it("keys the two wasm modules by the requested version", () => {
    expect(duckdbWasmKey(u("/duckdb/duckdb-eh.wasm?v=1.33.1-dev45.0"), "9.9.9")).toBe(
      "duckdb/1.33.1-dev45.0/duckdb-eh.wasm",
    );
    expect(duckdbWasmKey(u("/duckdb/duckdb-mvp.wasm"), "1.0.0")).toBe("duckdb/1.0.0/duckdb-mvp.wasm");
  });

  it("leaves every other /duckdb file to the asset store", () => {
    expect(duckdbWasmKey(u("/duckdb/duckdb-browser-eh.worker.js?v=1"), "1")).toBeNull();
    expect(duckdbWasmKey(u("/duckdb/extensions/v1.5.1/wasm_eh/json.duckdb_extension.wasm"), "1")).toBeNull();
  });

  it("refuses a version that could walk the bucket", () => {
    expect(duckdbWasmKey(u("/duckdb/duckdb-eh.wasm?v=../x"), "1")).toBeNull();
  });
});

describe("parseRange", () => {
  it("parses the forms DuckDB and the smoke test send", () => {
    expect(parseRange("bytes=0-3", 100)).toEqual({ start: 0, end: 3 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-8", 100)).toEqual({ start: 92, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
  });

  it("serves the whole file for no header or a multi-range, and 416 past the end", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
  });
});

describe("wrangler.jsonc", () => {
  const wrangler = readFileSync(path.join(root, "wrangler.jsonc"), "utf8");

  it("runs the Worker first for exactly the prefixes it handles", () => {
    for (const p of WORKER_FIRST_PREFIXES) expect(wrangler).toContain(`"${p}*"`);
  });

  it("names the @duckdb/duckdb-wasm version in package.json", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(wrangler).toContain(`"DUCKDB_WASM_VERSION": "${pkg.dependencies["@duckdb/duckdb-wasm"] ?? ""}"`);
  });
});
