import { test, expect } from "@playwright/test";

// DuckDB-WASM loads from jsDelivr CDN; allow up to 90 s for the full test.
test.setTimeout(90_000);

test("phase 2 critical path", async ({ page }) => {
  page.on("pageerror", (err) => { console.error("PAGE ERROR:", err.message); });
  await page.goto("/");

  // Map canvas attaches
  await expect(page.locator("#deck-canvas")).toBeVisible();

  // All four layer checkboxes present in the LayerPanel
  await expect(page.getByLabel(/Reserves \(country\)/i)).toBeVisible();
  await expect(page.getByLabel(/Extraction sites/i)).toBeVisible();
  await expect(page.getByLabel(/^Pipelines$/i)).toBeVisible();
  await expect(page.getByLabel(/^Refineries$/i)).toBeVisible();

  // Layer toggle works — uncheck then re-check Extraction sites
  const extraction = page.getByLabel(/Extraction sites/i);
  await extraction.uncheck();
  await expect(extraction).not.toBeChecked();
  await extraction.check();
  await expect(extraction).toBeChecked();

  // Scenario dropdown lists all 4 scenarios
  const select = page.locator("select").first();
  await expect(select).toBeVisible();
  const optionLabels = await select.locator("option").allTextContents();
  expect(optionLabels.some((s) => /Hormuz/i.test(s))).toBe(true);
  expect(optionLabels.some((s) => /Druzhba/i.test(s))).toBe(true);
  expect(optionLabels.some((s) => /Baku-Tbilisi-Ceyhan/i.test(s))).toBe(true);
  expect(optionLabels.some((s) => /Caspian/i.test(s))).toBe(true);

  // Select Druzhba — ranked importer and refinery lists populate
  // DuckDB-WASM queries may take up to ~30 s on first load (CDN latency + WASM init).
  await select.selectOption("druzhba");
  await expect(page.getByText(/Top importers at risk/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Top refineries at risk/i)).toBeVisible({ timeout: 60_000 });

  // At least one ranked row with a percentage should appear
  await expect(page.locator("ol li").filter({ hasText: /%/ }).first()).toBeVisible({
    timeout: 60_000,
  });

  // About page renders with methodology heading and GEM attribution
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Global Energy Monitor" }).first()).toBeVisible();
});
