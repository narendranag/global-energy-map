import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const instantiate = vi.fn<(m: string, p: string | null) => Promise<void>>();
const workers: string[] = [];

vi.mock("@duckdb/duckdb-wasm", () => ({
  PACKAGE_VERSION: "9.9.9-test",
  LogLevel: { WARNING: 3 },
  ConsoleLogger: function ConsoleLogger() {
    return undefined;
  },
  selectBundle: (b: { eh: { mainModule: string; mainWorker: string } }) =>
    Promise.resolve({ mainModule: b.eh.mainModule, mainWorker: b.eh.mainWorker, pthreadWorker: null }),
  AsyncDuckDB: class {
    instantiate(m: string, p: string | null) {
      return instantiate(m, p);
    }
  },
}));

import { __resetDuckDBForTests, getDuckDB } from "@/lib/duckdb/bootstrap";
import { DUCKDB_FILES, selfHostedBundles } from "@/lib/duckdb/bundles";

class FakeWorker {
  constructor(url: string) {
    workers.push(url);
  }
  terminate() {
    workers.push("terminated");
  }
}

beforeEach(() => {
  __resetDuckDBForTests();
  instantiate.mockReset();
  workers.length = 0;
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDuckDB (P1: one instance)", () => {
  it("N concurrent calls share one worker and one instantiation", async () => {
    instantiate.mockResolvedValue(undefined);
    const dbs = await Promise.all(Array.from({ length: 6 }, () => getDuckDB()));
    expect(instantiate).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(1);
    expect(new Set(dbs).size).toBe(1);
    await getDuckDB();
    expect(instantiate).toHaveBeenCalledTimes(1);
  });

  it("evicts a failed boot so the next call retries", async () => {
    instantiate.mockRejectedValueOnce(new Error("wasm failed")).mockResolvedValue(undefined);
    await expect(getDuckDB()).rejects.toThrow("wasm failed");
    await expect(getDuckDB()).resolves.toBeDefined();
    expect(instantiate).toHaveBeenCalledTimes(2);
  });

  it("boots from the self-hosted /duckdb/ bundle, never jsDelivr (P2)", async () => {
    instantiate.mockResolvedValue(undefined);
    await getDuckDB();
    const [module] = instantiate.mock.calls[0] ?? [];
    expect(module).toBe(`${window.location.origin}/duckdb/duckdb-eh.wasm?v=9.9.9-test`);
    expect(workers[0]).toBe(`${window.location.origin}/duckdb/duckdb-browser-eh.worker.js?v=9.9.9-test`);
  });
});

describe("selfHostedBundles", () => {
  it("points every bundle at a versioned same-origin /duckdb/ URL", () => {
    const b = selfHostedBundles("https://example.org", "1.2.3");
    const urls = [b.mvp.mainModule, b.mvp.mainWorker, b.eh?.mainModule, b.eh?.mainWorker];
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\/example\.org\/duckdb\/[a-z-]+\.(wasm|worker\.js)\?v=1\.2\.3$/);
      expect(u).not.toMatch(/jsdelivr/);
    }
    expect(b.coi).toBeUndefined();
  });

  it("uses only files the copy script ships", async () => {
    const script = (await import("../../../scripts/copy-duckdb.mjs")) as { DUCKDB_FILES: string[] };
    expect([...script.DUCKDB_FILES].sort()).toEqual([...DUCKDB_FILES].sort());
  });
});
