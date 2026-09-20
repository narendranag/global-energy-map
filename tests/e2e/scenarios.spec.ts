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
  yearSlider,
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
  test("oil dropdown lists every oil scenario; gas lists only the chokepoints with an LNG axis", async ({ page }) => {
    // The picker lives in Scenarios mode (or wherever a scenario is active).
    await gotoReady(page, "/?mode=scenarios&layers=reserves");
    const select = scenarioSelect(page);
    const oil = await select.locator("option").allTextContents();
    expect(oil.some((s) => /Hormuz/i.test(s))).toBe(true);
    expect(oil.some((s) => /Druzhba/i.test(s))).toBe(true);
    expect(oil.some((s) => /Baku-Tbilisi-Ceyhan/i.test(s))).toBe(true);
    expect(oil.some((s) => /Caspian/i.test(s))).toBe(true);
    // S6 (2026-09-19): new chokepoints and pipelines.
    expect(oil.some((s) => /Malacca/i.test(s))).toBe(true);
    expect(oil.some((s) => /Suez/i.test(s))).toBe(true);
    expect(oil.some((s) => /Bab el-Mandeb/i.test(s))).toBe(true);
    expect(oil.some((s) => /Turkish Straits/i.test(s))).toBe(true);
    expect(oil.some((s) => /Keystone/i.test(s))).toBe(true);
    expect(oil.some((s) => /Enbridge Mainline/i.test(s))).toBe(true);
    expect(oil.some((s) => /ESPO/i.test(s))).toBe(true);

    await press(page.getByRole("button", { name: "Gas" }));
    const gas = await select.locator("option").allTextContents();
    expect(gas.some((s) => /Hormuz/i.test(s))).toBe(true);
    expect(gas.some((s) => /Malacca/i.test(s))).toBe(true);
    expect(gas.some((s) => /Suez/i.test(s))).toBe(true);
    expect(gas.some((s) => /Bab el-Mandeb/i.test(s))).toBe(true);
    // Oil-only scenarios (no LNG-carrying commodity for these routes) stay off the gas list.
    expect(
      gas.some((s) => /Druzhba|Baku-Tbilisi-Ceyhan|Caspian|Turkish Straits|Keystone|Enbridge|ESPO/i.test(s)),
    ).toBe(false);
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

  // A1: an oil-only scenario has no gas route rows at all, so pairing it with
  // the gas axis could only ever render a confident 0 %. Both the toggle and
  // the URL clear it instead.
  test("switching to Gas clears an oil-only scenario rather than showing zeros", async ({
    page,
  }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=druzhba&commodity=oil&year=2020&layers=reserves");
    await expect(scenarioSelect(page)).toHaveValue("druzhba");

    await press(page.getByRole("button", { name: "Gas" }));
    await waitForReady(page);
    await expect(scenarioSelect(page)).not.toHaveValue("druzhba");
    expect(new URL(page.url()).searchParams.get("scenario")).toBeNull();
  });

  test("a hand-typed oil-only scenario on the gas axis decodes to no scenario", async ({
    page,
  }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=druzhba&commodity=gas&year=2020&layers=reserves");
    // The querystring still reads `scenario=druzhba` — nothing changed state,
    // so the store never rewrote the URL, exactly as an unknown `focus=`
    // behaves. What matters is that the app decoded it as "no scenario": no
    // selection in the picker and no result table of zeros.
    await expect(scenarioSelect(page)).not.toHaveValue("druzhba");
    await expect(page.getByTestId("ranked-importers")).toHaveCount(0);

    // Selecting a gas scenario from here still works.
    await scenarioSelect(page).selectOption("hormuz");
    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
  });
});

/**
 * T1: partial closures, two scenarios at once, and the exporter view.
 *
 * Every figure asserted here was computed from the shipped parquet
 * (`trade_flow.parquet` × `disruption_route.parquet`, the same pair-beats-
 * wildcard rule the engine applies) before the test was written — see the
 * comment on each.
 */
test.describe("Scenarios — severity, combination, exporter view", () => {
  /** The ranked row for one country, by its ISO3 code. */
  const row = (page: Parameters<typeof waitForReady>[0], iso3: string) =>
    page.getByTestId("ranked-importers").locator("li").filter({ hasText: iso3 });

  test("sev=50 halves the volume at risk and says so", async ({ page }) => {
    // Hormuz, crude, 2024: Japan imports 116.88 Mt, of which 85.72 Mt
    // (73.3379 % = 1,721 kb/d) moves through the strait. At 50 % severity
    // that is 36.6689 % and 861 kb/d — the denominator does not move.
    await gotoReady(page, "/?scenario=hormuz&commodity=oil&year=2024&layers=reserves");
    await expect(row(page, "JPN").first()).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(row(page, "JPN").first()).toContainText("73.3%");
    await expect(row(page, "JPN").first()).toContainText("1,721 kb/d");

    await gotoReady(page, "/?scenario=hormuz&commodity=oil&year=2024&layers=reserves&sev=50");
    await expect(row(page, "JPN").first()).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(row(page, "JPN").first()).toContainText("36.7%");
    await expect(row(page, "JPN").first()).toContainText("861 kb/d");
    await expect(page.getByTestId("severity-value")).toHaveText("50%");
    await expect(page.getByTestId("scenario-metric")).toContainText("50% of it cut");
  });

  test("the severity slider is keyboard operable and writes sev=", async ({ page }) => {
    await gotoReady(page, "/?scenario=hormuz&commodity=oil&year=2024&layers=reserves");
    const slider = page.getByTestId("severity-slider");
    await expect(slider).toHaveValue("100");
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveValue("95");
    await expect(page.getByTestId("severity-value")).toHaveText("95%");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sev"), { timeout: 10_000 })
      .toBe("95");
    // Back to a full closure and the parameter disappears again.
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("sev"), { timeout: 10_000 })
      .toBeNull();
  });

  test("combining Hormuz with Malacca does not double-count Japan", async ({ page }) => {
    // Japan's Gulf crude crosses BOTH straits, so the two closures are in
    // series for Japan: max(0.7334, 0.9485) = 0.9485, and the upper bound
    // min(1, hormuz + malacca) is 0.9485 too, because every flow Hormuz
    // touches is already fully claimed by Malacca. Malacca alone is the same
    // 94.9 %, which is the point: adding a second closure cannot cut a cargo
    // twice.
    await gotoReady(page, "/?scenario=malacca&commodity=oil&year=2024&layers=reserves");
    await expect(row(page, "JPN").first()).toContainText("94.9%", { timeout: RESULT_TIMEOUT });

    await gotoReady(
      page,
      "/?scenario=hormuz&scenario2=malacca&commodity=oil&year=2024&layers=reserves",
    );
    const jpn = row(page, "JPN").first();
    await expect(jpn).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(jpn).toContainText("94.9%");
    // No range: the two ends coincide, and printing "94.9–94.9%" would invent
    // an uncertainty that is not there.
    expect(await jpn.innerText()).not.toMatch(/94\.9\s*–/);
    await expect(page.getByTestId("scenario-2")).toHaveValue("malacca");
    await expect(page.getByTestId("how-computed")).toContainText("2 routes are closed at once");
  });

  test("two routes in parallel show a range, with a note on what it means", async ({ page }) => {
    // Keystone + Enbridge Mainline, crude, 2024: Canadian crude reaches the
    // US on both systems, and no US flow is claimed in full by either, so the
    // bounds genuinely differ — 36.4981 % (max) to 45.0143 % (capped sum).
    await gotoReady(
      page,
      "/?scenario=keystone&scenario2=enbridge_mainline&commodity=oil&year=2024&layers=reserves",
    );
    const usa = row(page, "USA").first();
    await expect(usa).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(usa).toContainText("36.5–45.0%");
    await expect(page.getByTestId("range-note")).toContainText("in series");
    await expect(page.getByTestId("range-note")).toContainText("in parallel");
    // Asset rows are the low end, and the panel says so.
    await expect(page.getByTestId("scenario-results")).toContainText("low end of the range");
  });

  test("the exporter view ranks Saudi Arabia first for Hormuz crude 2024", async ({ page }) => {
    // SAU exported 309.16 Mt of crude in 2024, 272.06 Mt of it (88 %) through
    // Hormuz — more volume at risk than Iraq (156.15 Mt) or the UAE
    // (119.04 Mt). The default sort is by volume.
    await gotoReady(page, "/?scenario=hormuz&commodity=oil&year=2024&layers=reserves&view=exporters");
    await expect(page.getByText("Top exporters at risk")).toBeVisible({ timeout: RESULT_TIMEOUT });
    const rows = page.getByTestId("ranked-importers").locator("li");
    await expect(rows.first()).toContainText("SAU", { timeout: RESULT_TIMEOUT });
    await expect(rows.first()).toContainText("88.0%");
    await expect(page.getByTestId("scenario-metric")).toContainText("crude exports");

    // Back to importers through the segmented control, and the URL follows.
    await press(page.getByTestId("view-toggle").getByRole("button", { name: "Importers" }));
    await expect(page.getByText("Top importers at risk")).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect
      .poll(() => new URL(page.url()).searchParams.get("view"), { timeout: 10_000 })
      .toBeNull();
  });

  test("a combination picked in the panel round-trips through the URL", async ({ page }) => {
    await gotoReady(page, "/?scenario=hormuz&commodity=oil&year=2024&layers=reserves");
    await page.getByTestId("scenario-2").selectOption("malacca");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("scenario2"), { timeout: 10_000 })
      .toBe("malacca");
    // `scenario` keeps naming exactly one id — never "hormuz+malacca".
    expect(new URL(page.url()).searchParams.get("scenario")).toBe("hormuz");

    // Choosing a new primary drops the combination.
    await scenarioSelect(page).selectOption("druzhba");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("scenario2"), { timeout: 10_000 })
      .toBeNull();
  });

  test("a pre-T1 link is unchanged: no sev, scenario2 or view appears", async ({ page }) => {
    await gotoReady(page, "/?scenario=hormuz&commodity=oil&year=2020&layers=reserves");
    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
    // Move the year, which forces the store to rewrite the querystring.
    await yearSlider(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("year"), { timeout: 10_000 })
      .toBe("2021");
    const params = new URL(page.url()).searchParams;
    expect(params.get("sev")).toBeNull();
    expect(params.get("scenario2")).toBeNull();
    expect(params.get("view")).toBeNull();
    expect(params.get("scenario")).toBe("hormuz");
  });
});
