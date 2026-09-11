// tests/e2e/scenarios.spec.ts — disruption scenarios: panel, ranked lists, overlay.
import {
  SPEC_TIMEOUT,
  clickUntil,
  collectConsoleErrors,
  expect,
  gotoReady,
  press,
  projectAll,
  redness,
  samplePixels,
  scenarioSelect,
  test,
  waitForReady,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

/** Scenario results can queue behind the default-layer loads. */
const RESULT_TIMEOUT = 120_000;

/** Probe points inside southern India, clear of the country label. */
const INDIA_POINTS = [
  { lon: 78.0, lat: 13.0 },
  { lon: 75.5, lat: 17.0 },
] as const;

test.describe("Scenarios", () => {
  test("oil dropdown lists all four scenarios; gas lists only Hormuz", async ({ page }) => {
    // The picker lives in Scenarios mode (or wherever a scenario is active).
    await gotoReady(page, "/?mode=scenarios&layers=reserves");
    const select = scenarioSelect(page);
    const oil = await select.locator("option").allTextContents();
    expect(oil.some((s) => /Hormuz/i.test(s))).toBe(true);
    expect(oil.some((s) => /Druzhba/i.test(s))).toBe(true);
    expect(oil.some((s) => /Baku-Tbilisi-Ceyhan/i.test(s))).toBe(true);
    expect(oil.some((s) => /Caspian/i.test(s))).toBe(true);

    await press(page.getByRole("button", { name: "Gas" }));
    const gas = await select.locator("option").allTextContents();
    expect(gas.some((s) => /Hormuz/i.test(s))).toBe(true);
    expect(gas.some((s) => /Druzhba|Baku-Tbilisi-Ceyhan|Caspian/i.test(s))).toBe(false);
  });

  test("Scenarios tab from the default map, then Hormuz, populates the ranked list", async ({
    page,
  }) => {
    await gotoReady(page, "/");
    await expect(scenarioSelect(page)).toHaveCount(0);
    await clickUntil(page.getByRole("tab", { name: "Scenarios" }), async () => {
      await expect(scenarioSelect(page)).toBeVisible({ timeout: 2_000 });
    });
    // A tab click hands focus to the picker.
    await expect(scenarioSelect(page)).toBeFocused();
    await scenarioSelect(page).selectOption("hormuz");
    await expect(page.locator("ol li").filter({ hasText: /%/ }).first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
    await waitForReady(page);
  });

  test("Druzhba: ranked importer and refinery lists populate", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&layers=reserves,refineries");
    await scenarioSelect(page).selectOption("druzhba");
    await expect(page.getByText(/Top importers at risk/i)).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(page.getByText(/Top refineries at risk/i)).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(page.locator("ol li").filter({ hasText: /%/ }).first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
  });

  test("Hormuz under commodity=gas (via the UI) shows the LNG ranked panel", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&layers=reserves,lng_terminals");
    await press(page.getByRole("button", { name: "Gas" }));
    await scenarioSelect(page).selectOption("hormuz");
    await expect(page.getByText("Top LNG import terminals at risk")).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
  });

  test("Hormuz (oil): metric defined, importers named, no pseudo-countries, overlay drawn", async ({
    page,
  }) => {
    collectConsoleErrors(page);
    await gotoReady(page, "/?scenario=hormuz&commodity=oil&year=2020&layers=reserves");

    const metric = page.getByTestId("scenario-metric");
    await expect(metric).toBeVisible();
    await expect(metric).toContainText("share of each importer");
    await expect(metric).toContainText("crude imports");
    await expect(metric).toContainText("the Strait of Hormuz");

    const ranked = page.getByTestId("ranked-importers");
    const importers = ranked.locator("li");
    await expect(importers.first()).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(ranked).not.toContainText("S19");
    await expect(ranked).not.toContainText("ZA1");

    // Rows show a country name (not just a bare ISO3) plus a percentage.
    const firstRow = await importers.first().innerText();
    expect(firstRow).toMatch(/[A-Za-z]{4,}/);
    expect(firstRow).toMatch(/\d+\.\d%/);

    // Refinery rows show names too.
    await expect(page.getByTestId("ranked-assets").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });

    // Canvas probe: India (a heavily Hormuz-exposed importer) is painted with
    // the red exposure ramp over its green reserves fill.
    await expect
      .poll(
        async () => {
          const px = await samplePixels(page, await projectAll(page, INDIA_POINTS));
          return Math.min(...px.map(redness));
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(30);
  });

  test("Hormuz (gas): LNG-specific description and metric", async ({ page }) => {
    collectConsoleErrors(page);
    await gotoReady(page, "/?scenario=hormuz&commodity=gas&year=2020&layers=reserves");

    await expect(page.getByText(/no pipeline bypass for LNG/)).toBeVisible();
    await expect(page.getByTestId("scenario-metric")).toContainText("LNG imports");
    await expect(page.getByText("Top LNG import terminals at risk")).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
    await expect(page.getByTestId("ranked-importers")).not.toContainText("S19");
  });

  // Hormuz on the gas axis uses the LNG shares (QAT and ARE = 1.00: the UAE's
  // Fujairah bypass is crude-only), so UAE-sourced LNG is exposed.
  test("Hormuz (gas): UAE-sourced LNG is exposed (ARE → all importers 100%)", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023&layers=reserves,lng_terminals");

    const routes = page.getByTestId("route-shares");
    await expect(routes).toBeVisible({ timeout: RESULT_TIMEOUT });
    for (const exporter of ["United Arab Emirates", "Qatar"]) {
      const row = routes.locator("li").filter({ hasText: `${exporter} → all importers` });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("100%");
    }
    // The LNG table: those two rows plus one grouped entry for the 12 share-0
    // intra-Gulf pairs (not the crude rows, where the UAE's share is 65%
    // because of the crude-only Fujairah bypass).
    await expect(routes.locator(":scope > ul > li")).toHaveCount(3);
    await expect(routes.locator("li").filter({ hasText: "12 exporter → importer pairs" })).toContainText("0%");

    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
    // The screen-reader summary names the scenario and a most-exposed importer.
    await expect(page.getByTestId("scenario-announcement")).toContainText(/importers exposed; most exposed/);
    expect(errors).toEqual([]);
  });

  test("Hormuz gas scenario shows the LNG-T3 footnote in 2023", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?commodity=gas&scenario=hormuz&year=2023&layers=reserves,lng_terminals");
    await expect(page.getByText("LNG-T3 voyages")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Hormuz gas scenario hides the LNG-T3 footnote outside 2020–2024", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    // data-ready includes the scenario result, so absence is meaningful here.
    await gotoReady(page, "/?commodity=gas&scenario=hormuz&year=2019&layers=reserves,lng_terminals");
    await expect(page.getByText("Top LNG import terminals at risk")).toBeVisible();
    await expect(page.getByText("LNG-T3 voyages")).not.toBeVisible();
    expect(errors).toEqual([]);
  });
});
