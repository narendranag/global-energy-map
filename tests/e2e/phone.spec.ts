// tests/e2e/phone.spec.ts — under 768 px: the "best on desktop" banner, collapsed
// panels, and no horizontal scroll.
import type { Page } from "@playwright/test";
import { SPEC_TIMEOUT, clickUntil, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("Phone (400 px)", () => {
  test.use({ viewport: { width: 400, height: 800 }, hasTouch: true });

  test("banner shows, panels collapse to their headers, no horizontal scroll", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves,pipelines");
    await expect(page.getByTestId("phone-banner")).toBeVisible();
    await expect(page.getByTestId("phone-banner")).toContainText("Best viewed on a desktop");

    // Layers & legend: collapsed until tapped.
    const layersToggle = page.getByRole("button", { name: "Layers & legend" });
    await expect(layersToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Reserves (country)")).toBeHidden();
    await clickUntil(layersToggle, async () => {
      await expect(layersToggle).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
    });
    await expect(page.getByLabel("Reserves (country)")).toBeVisible();

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("scenario panel collapses to a header button; still no horizontal scroll", async ({ page }) => {
    await gotoReady(page, "/?scenario=druzhba&year=2020&layers=reserves");
    const toggle = page.getByRole("button", { name: "Scenario", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("combobox", { name: "Scenario" })).toBeHidden();
    await clickUntil(toggle, async () => {
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
    });
    await expect(page.getByRole("combobox", { name: "Scenario" })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("no banner on a desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoReady(page, "/?layers=");
    await expect(page.getByTestId("phone-banner")).toBeHidden();
  });
});
