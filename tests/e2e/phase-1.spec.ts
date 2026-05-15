import { test, expect } from "@playwright/test";

test("phase 1 critical path", async ({ page }) => {
  // Forward console errors so test failures are easier to debug
  page.on("pageerror", (err) => { console.error("PAGE ERROR:", err.message); });

  await page.goto("/");

  // Map canvas attaches
  await expect(page.locator("#deck-canvas")).toBeVisible();

  // Year slider present
  const slider = page.locator('input[type="range"]');
  await expect(slider).toBeVisible();

  // Scenario panel + checkbox
  const checkbox = page.getByLabel(/Close Strait of Hormuz/i);
  await expect(checkbox).toBeVisible();
  await checkbox.check();

  // Ranked list should populate — wait for at least one percentage line to appear.
  // Heuristic: monofont items with a "%" character (the ScenarioPanel's `font-mono text-xs` rows)
  await expect(page.locator("ol li").filter({ hasText: /%/ }).first()).toBeVisible({
    timeout: 20_000,
  });

  // About page renders catalog
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  // Use table cell selectors to avoid strict-mode collisions with methodology prose
  await expect(page.getByRole("cell", { name: /Energy Institute Statistical Review/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Global Energy Monitor" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /BACI/ })).toBeVisible();
});
