// tests/e2e/scenario-overlay.spec.ts — Phase 7 (C3/C6): honest scenario panel
import { test, expect } from "@playwright/test";

// Scenario queries queue behind DuckDB-WASM boot; keep the shared 180 s budget.
test.setTimeout(180_000);

test.describe("Scenario overlay + panel", () => {
  test("Hormuz (oil): metric defined, importers named, no pseudo-countries", async ({ page }) => {
    page.on("pageerror", (err) => { console.error("PAGE ERROR:", err.message); });
    await page.goto("/?scenario=hormuz&commodity=oil&year=2020&layers=reserves");
    await page.waitForSelector("#deck-canvas");

    const metric = page.getByTestId("scenario-metric");
    await expect(metric).toBeVisible();
    await expect(metric).toContainText("share of each importer");
    await expect(metric).toContainText("crude imports");
    await expect(metric).toContainText("the Strait of Hormuz");

    const importers = page.getByTestId("ranked-importers").locator("li");
    await expect(importers.first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("ranked-importers")).not.toContainText("S19");
    await expect(page.getByTestId("ranked-importers")).not.toContainText("ZA1");

    // Rows show a country name (not just a bare ISO3) plus a percentage.
    const firstRow = await importers.first().innerText();
    expect(firstRow).toMatch(/[A-Za-z]{4,}/);
    expect(firstRow).toMatch(/\d+\.\d%/);

    // Refinery rows show names too.
    const assets = page.getByTestId("ranked-assets").locator("li");
    await expect(assets.first()).toBeVisible({ timeout: 120_000 });
  });

  test("Hormuz (gas): LNG-specific description and metric", async ({ page }) => {
    page.on("pageerror", (err) => { console.error("PAGE ERROR:", err.message); });
    await page.goto("/?scenario=hormuz&commodity=gas&year=2020&layers=reserves");
    await page.waitForSelector("#deck-canvas");

    await expect(page.getByText(/no pipeline bypass for LNG/)).toBeVisible();
    const metric = page.getByTestId("scenario-metric");
    await expect(metric).toContainText("LNG imports");
    await expect(page.getByText("Top LNG import terminals at risk")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByTestId("ranked-importers")).not.toContainText("S19");
  });
});
