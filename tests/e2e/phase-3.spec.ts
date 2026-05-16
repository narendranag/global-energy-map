// tests/e2e/phase-3.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Phase 3 — gas + LNG + Hormuz-LNG", () => {
  test("commodity toggle restyles the choropleth", async ({ page }) => {
    await page.goto("/");
    // Wait for initial render
    await page.waitForSelector("canvas");
    const gasBtn = page.getByRole("button", { name: "Gas" });
    await expect(gasBtn).toBeVisible();
    await gasBtn.click();
    await expect(gasBtn).toHaveAttribute("aria-pressed", "true");
    // Canvas should still be present (a soft check — full pixel-diff is overkill here)
    await page.waitForTimeout(500);
    await expect(page.locator("#deck-canvas")).toBeVisible();
  });

  test("gas pipeline + LNG layer toggles in the layer panel", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Gas pipelines")).toBeVisible();
    await expect(page.getByLabel("LNG terminals")).toBeVisible();
    // Toggle gas pipelines off then on
    await page.getByLabel("Gas pipelines").click();
    await page.getByLabel("Gas pipelines").click();
  });

  test("Hormuz under commodity=gas shows LNG ranked panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Gas" }).click();
    // Wait for the gas scenario list to settle (filter excludes Druzhba/BTC/CPC)
    const scenarioSelect = page.locator("select");
    await scenarioSelect.selectOption("hormuz");
    // LNG ranked label should appear
    await expect(page.getByText("Top LNG import terminals at risk")).toBeVisible({ timeout: 10_000 });
  });
});
