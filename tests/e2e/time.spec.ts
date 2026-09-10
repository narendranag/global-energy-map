// tests/e2e/time.spec.ts — Phase 7 (C1/C2/C6): 1990–2024 time axis + reserves freeze
import { test, expect, type Page } from "@playwright/test";

// Every spec boots DuckDB-WASM + deck.gl under software WebGL; keep the
// shared 180 s budget (see playwright.config.ts / CLAUDE.md).
test.setTimeout(180_000);

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

const RESERVES_BADGE = "Reserves: 2020 value (latest in EI Statistical Review)";

test.describe("Time axis — 1990–2024", () => {
  test("slider spans 1990–2024 and an out-of-range URL year is clamped", async ({ page }) => {
    await page.goto("/?year=99999&layers=reserves");
    await page.waitForSelector(".maplibregl-canvas");

    const slider = page.locator('input[type="range"]');
    await expect(slider).toHaveAttribute("min", "1990");
    await expect(slider).toHaveAttribute("max", "2024");
    await expect(slider).toHaveValue("2024");
  });

  test("stepping past 2020 by keyboard shows the reserves badge", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?year=2020&layers=reserves");
    await page.waitForSelector(".maplibregl-canvas");

    const slider = page.locator('input[type="range"]');
    await expect(slider).toHaveValue("2020");
    await expect(page.getByText(RESERVES_BADGE)).toHaveCount(0);

    // The slider is controlled by URL state (router.replace → re-render), so
    // wait for each step to land before pressing again.
    await slider.focus();
    for (const expected of ["2021", "2022", "2023"]) {
      await page.keyboard.press("ArrowRight");
      await expect(slider).toHaveValue(expected, { timeout: 20_000 });
    }
    await expect(page).toHaveURL(/year=2023/);
    await expect(page.getByText(RESERVES_BADGE)).toBeVisible();

    // The choropleth still renders (frozen at 2020) once the page settles.
    await expect(page.locator("main")).toHaveAttribute("data-ready", "true", {
      timeout: 120_000,
    });
    expect(errors).toEqual([]);
  });

  test("no reserves badge when the reserves layer is off", async ({ page }) => {
    await page.goto("/?year=2023&layers=pipelines");
    await page.waitForSelector(".maplibregl-canvas");
    await expect(page.locator('input[type="range"]')).toHaveValue("2023");
    await expect(page.getByText(RESERVES_BADGE)).toHaveCount(0);
  });

  test("LNG voyages layer loads at 2023", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/?layers=lng_terminals,lng_voyages&year=2023");
    await page.waitForSelector(".maplibregl-canvas");

    await expect(page.getByLabel("LNG voyages (2020–2024)")).toBeChecked();
    // data-ready flips only once every visible layer hook — including the
    // voyages ArcLayer — has produced a layer.
    await expect(page.locator("main")).toHaveAttribute("data-ready", "true", {
      timeout: 120_000,
    });
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
