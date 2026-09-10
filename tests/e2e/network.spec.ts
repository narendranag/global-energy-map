// tests/e2e/network.spec.ts — runtime network hygiene (Phase 10).
import { SPEC_TIMEOUT, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

const BANNED_HOSTS = new Set(["cdn.jsdelivr.net", "extensions.duckdb.org"]);

test.describe("Network", () => {
  // Phase 10 self-hosts the DuckDB-WASM bundle and its parquet extension:
  // the only third-party host at runtime is the basemap (tiles.openfreemap.org).
  test("a cold load makes no requests to cdn.jsdelivr.net or extensions.duckdb.org", async ({
    page,
  }) => {
    const banned: string[] = [];
    // Context-level: also sees the DuckDB worker's own fetches.
    page.context().on("request", (req) => {
      const { hostname } = new URL(req.url());
      if (BANNED_HOSTS.has(hostname)) banned.push(req.url());
    });

    // Default view + a scenario, so every DuckDB-backed path runs.
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023");
    await expect(page.getByTestId("ranked-importers")).toBeVisible();
    expect([...new Set(banned)]).toEqual([]);
  });
});
