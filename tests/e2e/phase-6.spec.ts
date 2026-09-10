// tests/e2e/phase-6.spec.ts
import { test, expect, type Page } from "@playwright/test";

// DuckDB-WASM loads from jsDelivr CDN; allow headroom for the scenario engine too.
test.setTimeout(60_000);

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

test.describe("Phase 6 — LNG-T3 voyages", () => {
  test("lng_voyages layer boots with the checkbox checked", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?layers=reserves,lng_terminals,lng_voyages&year=2023");
    await page.waitForSelector(".maplibregl-canvas");

    await expect(page.getByLabel("LNG voyages (2020–2024)")).toBeChecked();
    await expect(page.locator("canvas").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Hormuz gas scenario shows the LNG-T3 footnote in 2023", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(
      "/?commodity=gas&scenario=hormuz&year=2023&layers=reserves,lng_terminals",
    );
    await page.waitForSelector(".maplibregl-canvas");

    await expect(page.getByText("LNG-T3 voyages")).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test("Hormuz gas scenario hides the LNG-T3 footnote outside 2020-2024", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(
      "/?commodity=gas&scenario=hormuz&year=2019&layers=reserves,lng_terminals",
    );
    await page.waitForSelector(".maplibregl-canvas");

    // Give the scenario engine time to resolve before asserting absence.
    await expect(page.getByText("Top LNG import terminals at risk")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("LNG-T3 voyages")).not.toBeVisible();
    expect(errors).toEqual([]);
  });

  test("/about lists the LNG-T3 source under CC BY 4.0", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText("LNG-T3").first()).toBeVisible();
    await expect(page.getByText("CC BY 4.0").first()).toBeVisible();
  });

  test("a URL without lng_voyages leaves the checkbox unchecked", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?layers=reserves,lng_terminals&year=2023");
    await page.waitForSelector(".maplibregl-canvas");

    await expect(page.getByLabel("LNG voyages (2020–2024)")).not.toBeChecked();
    expect(errors).toEqual([]);
  });
});
