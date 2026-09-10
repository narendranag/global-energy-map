import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import {
  BUFFER_MAX_BYTES,
  __resetDataFilesForTests,
  needsPrefetch,
  referencedDataFiles,
  registerDataFile,
  registrationMode,
} from "@/lib/duckdb/files";
import { BUNDLED_CATALOG } from "@/lib/data-catalog/bundled";
import { dataUrl } from "@/lib/data/urls";

function fakeDb() {
  return {
    registerFileBuffer: vi.fn<(name: string, buf: Uint8Array) => Promise<void>>(() =>
      Promise.resolve(),
    ),
    registerFileURL: vi.fn<
      (name: string, url: string, proto: number, direct: boolean) => Promise<void>
    >(() => Promise.resolve()),
  };
}
const asDb = (d: ReturnType<typeof fakeDb>) => d as unknown as AsyncDuckDB;

const fetchMock = vi.fn((url: string) =>
  Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: url ? 200 : 500 })),
);

beforeEach(() => {
  __resetDataFilesForTests();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("referencedDataFiles", () => {
  it("finds each quoted /data/*.parquet literal once", () => {
    const sql = `SELECT * FROM read_parquet('/data/a.parquet') a
      JOIN read_parquet('/data/b_c.parquet') b USING (x)
      WHERE a.y IN (SELECT y FROM read_parquet('/data/a.parquet'))`;
    expect(referencedDataFiles(sql)).toEqual(["/data/a.parquet", "/data/b_c.parquet"]);
  });
  it("ignores non-data paths", () => {
    expect(referencedDataFiles("SELECT 1 FROM read_parquet('https://x/y.parquet')")).toEqual([]);
  });
});

describe("registrationMode (P4: per-file choice by catalog size)", () => {
  const runtimeParquets = [
    ...new Set(
      BUNDLED_CATALOG.entries
        .filter((e) => e.runtime !== false && e.path.endsWith(".parquet"))
        .map((e) => e.path),
    ),
  ];

  it("every runtime parquet shipped today is small enough to buffer", () => {
    expect(runtimeParquets.length).toBeGreaterThan(0);
    for (const p of runtimeParquets) expect(registrationMode(p), p).toBe("buffer");
  });

  it("falls back to URL registration for uncatalogued or oversized files", () => {
    expect(registrationMode("/data/not-in-catalog.parquet")).toBe("url");
    const big = BUNDLED_CATALOG.entries.find((e) => (e.bytes ?? 0) > BUFFER_MAX_BYTES);
    if (big) expect(registrationMode(big.path)).toBe("url");
  });
});

describe("registerDataFile", () => {
  it("registers a small file once, as a buffer fetched from its versioned URL", async () => {
    const db = fakeDb();
    await Promise.all([
      registerDataFile(asDb(db), "/data/assets.parquet"),
      registerDataFile(asDb(db), "/data/assets.parquet"),
    ]);
    await registerDataFile(asDb(db), "/data/assets.parquet");
    expect(db.registerFileBuffer).toHaveBeenCalledTimes(1);
    expect(db.registerFileBuffer.mock.calls[0]?.[0]).toBe("/data/assets.parquet");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(dataUrl("/data/assets.parquet"));
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\?v=[0-9a-f]{8}$/);
    expect(needsPrefetch("/data/assets.parquet")).toBe(false);
  });

  it("registers a large/uncatalogued file by URL under its logical name", async () => {
    const db = fakeDb();
    await registerDataFile(asDb(db), "/data/not-in-catalog.parquet");
    expect(db.registerFileBuffer).not.toHaveBeenCalled();
    expect(db.registerFileURL).toHaveBeenCalledTimes(1);
    const [name, url, proto, direct] = db.registerFileURL.mock.calls[0] ?? [];
    expect(name).toBe("/data/not-in-catalog.parquet");
    expect(url).toBe(`${window.location.origin}/data/not-in-catalog.parquet`);
    expect(proto).toBe(4); // DuckDBDataProtocol.HTTP
    expect(direct).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries after a failed registration", async () => {
    const db = fakeDb();
    db.registerFileBuffer.mockRejectedValueOnce(new Error("nope"));
    await expect(registerDataFile(asDb(db), "/data/trade_flow.parquet")).rejects.toThrow("nope");
    await registerDataFile(asDb(db), "/data/trade_flow.parquet");
    expect(db.registerFileBuffer).toHaveBeenCalledTimes(2);
  });
});
