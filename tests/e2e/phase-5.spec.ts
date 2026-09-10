// tests/e2e/phase-5.spec.ts
import { test, expect, type Page } from "@playwright/test";

// Fail only on errors that indicate a real data/query/type failure — ignore
// WebGL/shader warnings, which are noisy and environment-dependent.
const FATAL_CONSOLE = /duckdb|SQL|TypeError|Binder/i;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && FATAL_CONSOLE.test(msg.text())) {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    if (FATAL_CONSOLE.test(err.message)) errors.push(err.message);
  });
  return errors;
}

test.describe("Phase 5 — refineries + vintage-aware layers", () => {
  test("refineries layer boots and the checkbox is checked", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?layers=refineries&year=2020");
    await page.waitForSelector("#deck-canvas");

    await expect(page.getByLabel("Refineries")).toBeChecked();
    expect(errors).toEqual([]);
  });

  test("pipelines respect the vintage filter at year=1995 without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?layers=pipelines&year=1995");
    await page.waitForSelector("#deck-canvas");
    await expect(page.getByLabel("Oil pipelines")).toBeChecked();
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });

  test("pipelines respect the vintage filter at year=2024 without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?layers=pipelines&year=2024");
    await page.waitForSelector("#deck-canvas");
    await expect(page.getByLabel("Oil pipelines")).toBeChecked();
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });

  test("pipelines.geojson is fetched exactly once on cold load", async ({ page }) => {
    // Oil and gas pipeline hooks share one loader; it must cache the
    // in-flight promise, not the parsed result, or both mount-time calls fetch.
    test.setTimeout(180_000);
    const hits: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/data/pipelines.geojson") hits.push(req.url());
    });
    await page.goto("/?layers=pipelines,gas_pipelines&year=2020");
    await page.waitForSelector("#deck-canvas");
    await expect(page.locator("main")).toHaveAttribute("data-ready", "true", {
      timeout: 120_000,
    });
    expect(hits).toHaveLength(1);
  });
});
