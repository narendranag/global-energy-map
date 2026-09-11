// tests/e2e/methodology.spec.ts — the /methodology page and its links to and from the map.
import { SPEC_TIMEOUT, clickUntil, expect, headerLink, test, waitForReady } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

test.describe("/methodology", () => {
  test("renders the methodology with its generated tables", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Disruption scenarios" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Contents" }).first()).toBeAttached();

    // Route shares, generated from disruption_route.parquet: the LNG rows too
    // (two exporter shares + one grouped row of share-0 intra-Gulf pairs).
    const shares = page.getByTestId("scenario-shares");
    await expect(shares.getByRole("cell", { name: "Strait of Hormuz (LNG)" })).toHaveCount(3);
    await expect(shares.getByRole("cell", { name: "42 pairs" })).toHaveCount(1);

    // Licence-required attribution lines, generated from catalog.json.
    const attributions = page.getByTestId("attributions");
    await expect(attributions).toContainText("Global Energy Monitor");
    await expect(attributions).toContainText("LNG-T3");
    await expect(attributions).toContainText("CC BY 4.0");
    await expect(attributions).toContainText("OpenStreetMap");

    await expect(page.getByTestId("how-to-cite")).toContainText("@software{");
  });

  test("links between the map and the methodology page", async ({ page }) => {
    await page.goto("/?layers=");
    await waitForReady(page);
    await clickUntil(headerLink(page, "Methodology"), async () => {
      await expect(page).toHaveURL(/\/methodology$/, { timeout: 5_000 });
    });
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();

    await page.getByRole("link", { name: /Back to map/ }).click();
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.getByRole("heading", { level: 1, name: "Global Energy Map" })).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  });
});
