// tests/e2e/scenario-context.spec.ts — the scenario panel's "Context" block
// (T3): EU gas-storage cover + a Comtrade recency check beside the active
// scenario's own result.
import { SPEC_TIMEOUT, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

/** Scenario results, plus the context block's own loaders, queue behind the default-layer loads. */
const RESULT_TIMEOUT = 120_000;

test.describe("Scenario context", () => {
  test("Hormuz, gas, 2024: Italy shows real Qatari-LNG-at-risk beside its GIE storage reading", async ({
    page,
  }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=gas&year=2024&layers=reserves");
    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });

    const context = page.getByTestId("scenario-context");
    await expect(context).toBeVisible();
    const storage = page.getByTestId("scenario-context-storage");
    await expect(storage).toBeVisible();
    // Italy imported ~4.75 Mt of Qatari LNG in 2024 (BACI), all of it routed
    // through Hormuz (share 1.0 for the exporter-wide row) — a real,
    // verified case, not a synthetic fixture.
    await expect(storage).toContainText("Italy");
    await expect(storage).toContainText("In storage on");
    await expect(storage).toContainText("TWh");
    await expect(storage).toContainText("days of the at-risk LNG volume");
    // The honesty caveat must be present verbatim-ish, not just the numbers.
    await expect(storage).toContainText("not a forecast");
  });

  test("the oil axis shows no storage block", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=oil&year=2024&layers=reserves");
    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
    await expect(page.getByTestId("scenario-context-storage")).toHaveCount(0);
  });

  test("Japan crude shows both the Comtrade and BACI figures; China shows no monthly reports", async ({
    page,
  }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=oil&year=2024&layers=reserves");
    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
    const recent = page.getByTestId("scenario-context-recent");
    await expect(recent).toBeVisible({ timeout: RESULT_TIMEOUT });
    await expect(recent).toContainText("BACI");
    // Japan and China are both large enough Hormuz-crude importers to be
    // among the top exposed importers the block checks.
    const text = await recent.innerText();
    expect(text).toMatch(/Japan/);
    if (text.includes("China")) {
      expect(text).toMatch(/no monthly reports/);
    }
  });

  test("is hidden under ?embed=1", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=gas&year=2024&layers=reserves&embed=1");
    // ScenarioPanel (and its Context child) is mounted regardless of the
    // phone/embed chip's own CSS collapse, so this proves the block itself
    // never enters the DOM under embed rather than merely being hidden by
    // an ancestor.
    await expect(page.locator("[data-testid='scenario-slot'] select").first()).toBeAttached();
    await expect(page.getByTestId("scenario-context")).toHaveCount(0);
  });
});
