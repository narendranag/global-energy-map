// tests/e2e/kirkuk-ceyhan.spec.ts — the first scenario whose route shares are
// year-bounded (2026-10-24). Kirkuk-Ceyhan was shut 2023–2025, so at the
// default year (2024) the panel must say so rather than quote a bare 0 %, and a
// link pinned to 2022 must show the route's pre-shutdown exposure, citing only
// the share valid that year.
import { SPEC_TIMEOUT, collectConsoleErrors, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

/** How long a scenario result may take to appear under software WebGL. */
const RESULT_TIMEOUT = 120_000;

test.describe("Kirkuk-Ceyhan (year-windowed route shares)", () => {
  test("at the latest year the shut pipeline is explained, not scored", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?mode=scenarios&scenario=kirkuk_ceyhan");
    await expect(page.getByTestId("scenario-announcement")).toContainText(
      /Kirkuk-Ceyhan.*2024 trade.*no importer/,
      { timeout: RESULT_TIMEOUT },
    );
    await expect(page.getByTestId("scenario-inactive")).toContainText(/shut from March 2023/);
    expect(errors).toEqual([]);
  });

  test("a link pinned to 2022 shows the pre-shutdown exposure and its window", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=kirkuk_ceyhan&year=2022");
    await expect(page.getByTestId("scenario-announcement")).toContainText(
      /Kirkuk-Ceyhan.*2022 trade.*importers exposed/,
      { timeout: RESULT_TIMEOUT },
    );
    await expect(page.getByTestId("scenario-inactive")).toHaveCount(0);
    // Only the 2022 window is cited: 13 %, "through 2022".
    await expect(page.getByText("(through 2022)")).toBeVisible();
    await expect(page.getByText("(2023–2025)")).toHaveCount(0);
  });
});
