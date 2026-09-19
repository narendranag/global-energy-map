// tests/e2e/query.spec.ts — the /query console: it runs, it stays on this
// origin, and the licence gate decides what may be saved as a file.
import type { Page } from "@playwright/test";
import { SPEC_TIMEOUT, clickUntil, expect, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

/** Booting DuckDB-WASM and decoding parquet under software WebGL is slow. */
const RUN_TIMEOUT = 120_000;

async function open(page: Page, url = "/query") {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Query console" })).toBeVisible();
}

/**
 * Click Run until `settled` passes. A click before hydration is dropped, so
 * it retries — and `settled` must describe the *new* state, not merely "a
 * result exists", or a stale result from the previous query would satisfy it.
 * The button is disabled while a query runs, so a retry waits rather than
 * queueing a second run.
 */
async function run(page: Page, settled: () => Promise<void>) {
  await clickUntil(page.getByTestId("run-query"), settled, RUN_TIMEOUT);
}

test.describe("Query console", () => {
  test("runs the default query and offers the result as CSV", async ({ page }) => {
    await open(page);

    // The schema sidebar comes from catalog.json, before DuckDB is loaded.
    await expect(page.getByTestId("schema-sidebar")).toBeVisible();
    await expect(page.getByTestId("table-trade_flow")).toBeVisible();
    await expect(page.getByTestId("table-trade_flow")).toContainText("downloadable");
    await expect(page.getByTestId("table-assets")).toContainText("view-only");

    await run(page, async () => {
      await expect(page.getByTestId("query-results")).toContainText("CHN", { timeout: 20_000 });
    });
    // The default query is "largest crude importers, 2024" (BACI).
    await expect(page.getByTestId("query-results")).toContainText("importer_iso3");
    await expect(page.getByTestId("query-results")).toContainText("CHN");
    await expect(page.getByTestId("query-status")).toContainText(/\d+ rows in \d+ ms/);

    // trade_flow is Etalab-licensed, so the result may leave the browser.
    await expect(page.getByTestId("export-csv")).toBeEnabled();
    await expect(page.getByTestId("export-blocked")).toHaveCount(0);

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-csv").click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/^query-result-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("the query travels in the URL and a shared link restores it", async ({ page }) => {
    await open(page);
    await run(page, async () => {
      await expect(page.getByTestId("query-results")).toBeVisible({ timeout: 20_000 });
    });
    const q = new URL(page.url()).searchParams.get("q");
    expect(q).toBeTruthy();

    // base64url of "SELECT 42 AS answer"
    const shared = Buffer.from("SELECT 42 AS answer").toString("base64url");
    await open(page, `/query?q=${shared}`);
    await expect(page.getByTestId("query-editor")).toHaveValue("SELECT 42 AS answer");
  });

  test("a view-only table blocks the download and says which one", async ({ page }) => {
    await open(page);
    // The GIE example is deliberately view-only (free, but not open-licensed).
    await page.getByTestId("example-gie-storage").click();
    await run(page, async () => {
      await expect(page.getByTestId("export-blocked")).toContainText("gie_daily", {
        timeout: 20_000,
      });
    });

    await expect(page.getByTestId("query-results")).toBeVisible();
    const blocked = page.getByTestId("export-blocked");
    await expect(blocked).toContainText("view-only");
    await expect(blocked.getByRole("link", { name: "LICENSE-DATA.md" })).toBeVisible();
    await expect(page.getByTestId("export-csv")).toBeDisabled();
  });

  test("a join that pulls in a view-only table cannot be exported either", async ({ page }) => {
    await open(page);
    await page
      .getByTestId("query-editor")
      .fill(
        "SELECT a.name, c.value FROM assets a JOIN country_year_series c ON a.country_iso3 = c.iso3 LIMIT 5",
      );
    await run(page, async () => {
      await expect(page.getByTestId("export-blocked")).toContainText("country_year_series", {
        timeout: 20_000,
      });
    });
    await expect(page.getByTestId("export-blocked")).toContainText("assets");
    await expect(page.getByTestId("export-csv")).toBeDisabled();
  });

  test("a bad query reports itself inline, not through the app's error panel", async ({ page }) => {
    await open(page);
    await page.getByTestId("query-editor").fill("SELECT * FROM no_such_table");
    await run(page, async () => {
      await expect(page.getByTestId("query-error")).toContainText("no_such_table", {
        timeout: 20_000,
      });
    });
    await expect(page.getByTestId("app-error")).toHaveCount(0);
    // The editor still works: fix the query and it runs.
    await page.getByTestId("query-editor").fill("SELECT 1 AS one");
    await run(page, async () => {
      await expect(page.getByTestId("query-status")).toContainText("1 row", { timeout: 20_000 });
    });
    await expect(page.getByTestId("query-error")).toHaveCount(0);
  });

  test("everything it loads comes from this origin", async ({ page, baseURL }) => {
    const foreign: string[] = [];
    const duckdb: string[] = [];
    const own = new URL(baseURL ?? "http://localhost:3000").host;
    // Context-level, so the DuckDB worker's own fetches are seen too.
    page.context().on("request", (req) => {
      const url = new URL(req.url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      // `next dev` loads Vercel Analytics' debug script from its CDN; a
      // deployment serves it first-party, and CI runs the production build.
      if (url.host === "va.vercel-scripts.com" && !process.env.CI) return;
      if (url.host !== own) foreign.push(`${url.host}${url.pathname}`);
      if (url.pathname.startsWith("/duckdb/")) duckdb.push(url.pathname);
    });

    await open(page);
    await run(page, async () => {
      await expect(page.getByTestId("query-results")).toBeVisible({ timeout: 20_000 });
    });

    // The privacy policy says the basemap is the only third-party host the
    // site contacts, and /query has no basemap: nothing may leave this origin.
    // In particular not extensions.duckdb.org — which bootstrap.ts used to
    // fall back to whenever the DuckDB core version drifted from the pin.
    expect([...new Set(foreign)]).toEqual([]);
    // The other half of the guard in network.spec.ts: /query is the one route
    // that *does* load DuckDB, so a failure here means the console is dead.
    expect(duckdb.length).toBeGreaterThan(0);
    await expect(page.getByTestId("engine-warning")).toHaveCount(0);
  });
});
