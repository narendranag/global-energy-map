// tests/e2e/time.spec.ts — the 1990–2024 time axis, reserves freeze, vintage filters.
import { test, expect } from "@playwright/test";
import {
  SPEC_TIMEOUT,
  collectConsoleErrors,
  gotoReady,
  saudiGreenness,
  waitForReady,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

const RESERVES_BADGE = "Reserves: 2020 value (latest in EI Statistical Review)";

test.describe("Time axis — 1990–2024", () => {
  test("slider spans 1990–2024 and an out-of-range URL year is clamped", async ({ page }) => {
    await gotoReady(page, "/?year=99999&layers=reserves");

    const slider = page.locator('input[type="range"]');
    await expect(slider).toHaveAttribute("min", "1990");
    await expect(slider).toHaveAttribute("max", "2024");
    await expect(slider).toHaveValue("2024");
  });

  test("stepping past 2020 by keyboard shows the reserves badge; the fill stays", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?year=2020&layers=reserves");

    const slider = page.locator('input[type="range"]');
    await expect(slider).toHaveValue("2020");
    await expect(page.getByText(RESERVES_BADGE)).toHaveCount(0);

    // Wait for each step to land before pressing again.
    await slider.focus();
    for (const expected of ["2021", "2022", "2023"]) {
      await page.keyboard.press("ArrowRight");
      await expect(slider).toHaveValue(expected, { timeout: 20_000 });
    }
    await expect(page).toHaveURL(/year=2023/);
    await expect(page.getByText(RESERVES_BADGE)).toBeVisible();

    // The choropleth still renders (frozen at 2020) once the page settles —
    // on the canvas, not just in the DOM.
    await waitForReady(page);
    await expect.poll(() => saudiGreenness(page), { timeout: 60_000 }).toBeGreaterThan(30);
    expect(errors).toEqual([]);
  });

  test("no reserves badge when the reserves layer is off", async ({ page }) => {
    await gotoReady(page, "/?year=2023&layers=pipelines");
    await expect(page.locator('input[type="range"]')).toHaveValue("2023");
    await expect(page.getByText(RESERVES_BADGE)).toHaveCount(0);
  });

  for (const year of [1995, 2024]) {
    test(`pipelines respect the vintage filter at year=${String(year)} without console errors`, async ({
      page,
    }) => {
      const errors = collectConsoleErrors(page);
      await gotoReady(page, `/?layers=pipelines&year=${String(year)}`);
      await expect(page.getByLabel("Oil pipelines")).toBeChecked();
      await expect(page.locator('input[type="range"]')).toHaveValue(String(year));
      expect(errors).toEqual([]);
    });
  }

  test("LNG voyages layer loads at 2023", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    // data-ready flips only once every visible layer — including the voyages
    // ArcLayer — has its data.
    await gotoReady(page, "/?layers=lng_terminals,lng_voyages&year=2023");
    await expect(page.getByLabel("LNG voyages (2020–2024)")).toBeChecked();
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
