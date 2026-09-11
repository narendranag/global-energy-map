// tests/e2e/share.spec.ts — Share / cite menu: copy link, cite the view, downloads.
import fs from "node:fs/promises";
import type { Page } from "@playwright/test";
import { SPEC_TIMEOUT, clickUntil, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** Open the Share / cite panel (hydration-safe) and return it. */
async function openShare(page: Page) {
  const panel = page.getByTestId("share-panel");
  await clickUntil(page.getByTestId("share-button"), async () => {
    await expect(panel).toBeVisible({ timeout: 2_000 });
  });
  return panel;
}

test.describe("Share / cite", () => {
  test("copy link puts the current view's URL on the clipboard; Escape closes", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&layers=reserves&year=2019&commodity=gas");
    const panel = await openShare(page);

    const urlBox = panel.getByRole("textbox", { name: "URL of this view" });
    // Opening moves focus into the panel (it is portalled to the end of <body>).
    await expect(urlBox).toBeFocused();
    const viewUrl = await urlBox.inputValue();
    const params = new URL(viewUrl).searchParams;
    expect(params.get("mode")).toBe("scenarios");
    expect(params.get("year")).toBe("2019");
    expect(params.get("commodity")).toBe("gas");
    expect(params.get("layers")).toBe("reserves");
    for (const key of ["lon", "lat", "z"]) expect(params.has(key), key).toBe(true);

    await panel.getByRole("button", { name: "Copy link" }).click();
    await expect(panel.getByRole("button", { name: "Copied" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Link copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(viewUrl);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("share-button")).toBeFocused();
  });

  test("cite text carries the view URL in every format", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves,pipelines&year=2020");
    const panel = await openShare(page);
    const viewUrl = await panel.getByRole("textbox", { name: "URL of this view" }).inputValue();
    const cite = panel.getByTestId("cite-text");

    // Default: APA + view summary + the sources behind the visible layers.
    await expect(cite).toContainText(viewUrl);
    await expect(cite).toContainText("Retrieved");
    await expect(cite).toContainText("Layers: Reserves (country), Oil pipelines");
    await expect(cite).toContainText("Sources behind this view:");
    await expect(cite).toContainText("Energy Institute");
    await expect(cite).toContainText("Global Energy Monitor");

    await panel.getByRole("button", { name: "APA", exact: true }).click();
    await expect(cite).toContainText(viewUrl);
    await expect(cite).not.toContainText("Sources behind this view:");

    await panel.getByRole("button", { name: "BibTeX", exact: true }).click();
    await expect(cite).toContainText("@software{");
    await expect(cite).toContainText(viewUrl);

    await panel.getByRole("button", { name: "Copy citation" }).click();
    await expect(panel.getByRole("status")).toHaveText("Citation copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("@software{");
  });

  test("scenario table downloads as CSV with a citation header", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=oil&year=2020&layers=reserves");
    const panel = await openShare(page);
    const button = panel.getByTestId("download-scenario-csv");
    await expect(button).toBeEnabled({ timeout: 60_000 });

    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("global-energy-map_scenario-hormuz_oil_2020.csv");
    const file = await download.path();
    const csv = await fs.readFile(file, "utf8");
    const lines = csv.split("\n");

    // `#` comment header: derived-analysis notice, BACI citation, every route
    // share with its source, the view URL and a site citation.
    const header = lines.filter((l) => l.startsWith("#")).join("\n");
    expect(header).toContain("DERIVED ANALYSIS");
    expect(header).toContain("Gaulier, G., & Zignago, S. (2010)");
    // 7 exporter shares + 42 share-0 intra-Gulf pairs, the pairs on one line.
    expect(header).toContain("Route shares (disruption_route.parquet, 49 rows");
    expect(header).toMatch(/ARE -> all importers: 0\.65 — /);
    expect(header).toMatch(/# {3}42 pairs \(IRN -> IRQ, .*\): 0 — /);
    expect(header).toMatch(/View: http:\/\/localhost:3000\/\?[^\n]*scenario=hormuz/);
    expect(header).toContain("Cite this site:");

    // Then the column row and at least one importer row.
    const body = lines.filter((l) => !l.startsWith("#") && l !== "");
    expect(body[0]).toMatch(/^row_type,iso3,country,/);
    expect(body.some((l) => l.startsWith("importer,"))).toBe(true);
    await expect(panel.getByRole("status")).toHaveText("Scenario table downloaded.");
  });

  test("downloads: reserves and refineries disabled with a reason; open layers enabled", async ({
    page,
  }) => {
    await gotoReady(page, "/?layers=reserves,pipelines,refineries&year=2020");
    const panel = await openShare(page);

    // No scenario → no scenario table.
    await expect(panel.getByTestId("download-scenario-csv")).toBeDisabled();
    await expect(panel).toContainText("Pick a disruption scenario");

    for (const label of ["Reserves (country)", "Refineries"]) {
      await expect(panel.getByRole("button", { name: `Download ${label} as CSV` })).toBeDisabled();
      await expect(panel.getByRole("button", { name: `Download ${label} as GeoJSON` })).toBeDisabled();
      await expect(
        panel.locator("li").filter({ hasText: label }).getByText(/^View-only\./),
      ).toBeVisible();
    }
    // GEM oil pipelines are CC BY 4.0: offered.
    await expect(panel.getByRole("button", { name: "Download Oil pipelines as CSV" })).toBeEnabled();
    await expect(panel.getByRole("button", { name: "Download Oil pipelines as GeoJSON" })).toBeEnabled();
  });
});
