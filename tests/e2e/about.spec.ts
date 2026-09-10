// tests/e2e/about.spec.ts — the methodology page renders off catalog.json.
import { test, expect } from "@playwright/test";
import { SPEC_TIMEOUT, clickUntil, waitForReady } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

test.describe("/about", () => {
  test("renders the methodology and the catalog source table", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data sources", exact: true })).toBeVisible();
    // Table cells, to avoid strict-mode collisions with the methodology prose.
    await expect(page.getByRole("cell", { name: /Energy Institute Statistical Review/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Global Energy Monitor" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /BACI/ })).toBeVisible();
  });

  test("lists the LNG-T3 source under CC BY 4.0", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText("LNG-T3").first()).toBeVisible();
    await expect(page.getByText("CC BY 4.0").first()).toBeVisible();
  });

  test("links between the map and the methodology page", async ({ page }) => {
    await page.goto("/?layers=");
    await waitForReady(page);
    await clickUntil(page.getByRole("link", { name: "Methodology & sources" }), async () => {
      await expect(page).toHaveURL(/\/about$/, { timeout: 5_000 });
    });
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();

    await page.getByRole("link", { name: /Back to map/ }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.getByRole("heading", { level: 1, name: "Global Energy Map" })).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  });
});
