// tests/e2e/as-of.spec.ts — the "as of" chip, the only year affordance left
// after the year slider was dropped (2026-09-21), plus the two places the
// scenario panel now states which year a result is built on.
//
// The contract (docs/superpowers/plans/2026-09-21-drop-year-slider.md):
//   * `year=` is still decoded from a link — a link is a citation.
//   * A pinned year is *stated* by the chip and is honoured everywhere
//     downstream (vintage filter, engine, the panel's headline and vintages).
//   * "View latest" is the one way back to the present.
//   * At the latest year there is no chip and the vintage filter hides nothing.
import {
  SPEC_TIMEOUT,
  clickUntil,
  collectConsoleErrors,
  countRedPixels,
  expect,
  gotoReady,
  mapBox,
  scenarioSelect,
  test,
  waitForReady,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

/** The latest reconciled trade year (`TRADE_LAST_YEAR`) — the map's default. */
const LATEST = 2024;

/** How long a scenario result may take to appear under software WebGL. */
const RESULT_TIMEOUT = 120_000;

/**
 * Map area clear of the floating panels at 1280×720 (same clip layers.spec
 * uses): at the default view it covers Europe, Africa and the Middle East.
 */
async function mapCentreClip(page: Parameters<typeof mapBox>[0]) {
  const box = await mapBox(page);
  return { x: box.x + 320, y: box.y + 60, width: 600, height: box.height - 260 };
}

test.describe("The 'as of' chip", () => {
  test("a pinned year is stated, honoured on the map, and 'View latest' clears it", async ({
    page,
  }) => {
    // Extraction sites are vintage-filtered (commissioned_year, 32% of rows),
    // so the count of burnt-orange site markers on the canvas is a direct
    // reading of which year the map is drawing.
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?layers=extraction&year=1990");

    const chip = page.getByTestId("as-of-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("As of 1990");

    const clip = await mapCentreClip(page);
    // Poll: the deck frame lands after `data-ready`.
    let pinned = 0;
    await expect
      .poll(
        async () => {
          pinned = await countRedPixels(page, clip);
          return pinned;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);

    // "View latest" removes the chip, writes the latest year to the URL, and
    // un-filters the map: every site shows, dated or not.
    await clickUntil(page.getByTestId("as-of-view-latest"), async () => {
      await expect(chip).toHaveCount(0, { timeout: 2_000 });
    });
    await expect(page).toHaveURL(new RegExp(`year=${String(LATEST)}`));
    await waitForReady(page);
    await expect.poll(() => countRedPixels(page, clip), { timeout: 60_000 }).toBeGreaterThan(pinned);

    expect(errors).toEqual([]);
  });

  test("a bare / reads at the latest year, with no chip", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves");
    await expect(page.getByTestId("as-of-chip")).toHaveCount(0);
    // Explicitly asking for the latest year is the same thing.
    await gotoReady(page, `/?layers=reserves&year=${String(LATEST)}`);
    await expect(page.getByTestId("as-of-chip")).toHaveCount(0);
  });

  test("the chip shows in an embed, even with controls=0", async ({ page }) => {
    // It is not a control an embedder may want hidden: it is the caption that
    // says which year the numbers on screen are.
    await gotoReady(page, "/?embed=1&controls=0&year=2010&layers=reserves");
    await expect(page.getByTestId("as-of-chip")).toContainText("As of 2010");
    // …while the controls that *are* controls stay hidden.
    await expect(page.getByRole("button", { name: "Oil" })).toHaveCount(0);
  });
});

test.describe("A scenario states the year it was run on", () => {
  test("a pinned year: the headline says so and the trade row is marked old", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=oil&year=2010&layers=reserves");

    const announcement = page.getByTestId("scenario-announcement");
    await expect(announcement).toBeVisible();
    // Both vintages, always: the number is trade x route share.
    await expect(announcement).toContainText("2010 trade, 2026 route shares", {
      timeout: RESULT_TIMEOUT,
    });
    await expect(announcement).toContainText(/importers exposed/);

    const vintage = page.getByTestId("scenario-vintage");
    await expect(vintage).toBeVisible();
    // Open by default — maximum transparency: the reader collapses it, not
    // the other way round.
    await expect(vintage).toHaveAttribute("open", "");
    // The trade row of a result pinned to an older year carries the amber
    // "old" marker: there really is newer trade the reader is not seeing.
    const tradeRow = vintage.locator("li").filter({ hasText: "run on 2010" });
    await expect(tradeRow).toHaveCount(1);
    await expect(tradeRow.getByText("old", { exact: true })).toBeVisible();
  });

  test("the latest year: the trade row carries no 'old' marker", async ({ page }) => {
    await gotoReady(
      page,
      `/?mode=scenarios&scenario=hormuz&commodity=oil&year=${String(LATEST)}&layers=reserves`,
    );
    const announcement = page.getByTestId("scenario-announcement");
    await expect(announcement).toContainText(`${String(LATEST)} trade, 2026 route shares`, {
      timeout: RESULT_TIMEOUT,
    });

    const vintage = page.getByTestId("scenario-vintage");
    const tradeRow = vintage.locator("li").filter({ hasText: `run on ${String(LATEST)}` });
    await expect(tradeRow).toHaveCount(1);
    // Bilateral trade is an annual release: it is always past the staleness
    // mark by the time the next one lands, so an "old" badge on every
    // scenario the site can compute would cry wolf (`showsStaleBadge`).
    await expect(tradeRow.getByText("old", { exact: true })).toHaveCount(0);
  });

  test("Scenarios mode with nothing picked offers the questions, and one answers", async ({
    page,
  }) => {
    await gotoReady(page, "/?mode=scenarios&layers=reserves");
    const empty = page.getByTestId("scenario-empty");
    await expect(empty).toBeVisible();
    await expect(scenarioSelect(page)).toHaveValue("");

    const first = empty.getByRole("button").first();
    await clickUntil(first, async () => {
      await expect(page).toHaveURL(/scenario=/, { timeout: 5_000 });
    });
    await expect(empty).toHaveCount(0);
    await expect(page.getByTestId("scenario-announcement")).toContainText(/exposed/, {
      timeout: RESULT_TIMEOUT,
    });
    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
  });
});

test.describe("A scenario states the vintage of its route shares too", () => {
  // The headline number is (trade in year Y) x (a routing share documented in
  // year D). Naming only Y let a 2019 routing read as current — these two
  // tests are the two sides of that fix, on the site's own data: Suez's
  // shares are one 2019 document, Hormuz's one 2026 document.
  test("Suez: both years in the headline, and a visible caveat for the gap", async ({ page }) => {
    await gotoReady(
      page,
      `/?mode=scenarios&scenario=suez&commodity=oil&year=${String(LATEST)}&layers=reserves`,
    );
    const announcement = page.getByTestId("scenario-announcement");
    await expect(announcement).toContainText(`${String(LATEST)} trade, 2019 route shares`, {
      timeout: RESULT_TIMEOUT,
    });

    // Under the headline, not inside the disclosure: it is about the number
    // on screen, not about a footnote to it.
    const caveat = page.getByTestId("scenario-vintage-caveat");
    await expect(caveat).toBeVisible();
    await expect(caveat).toContainText("2019 documents");
    await expect(caveat).toContainText(String(LATEST));

    // The disclosure is open without a click, and names the documents.
    const vintage = page.getByTestId("scenario-vintage");
    await expect(vintage).toHaveAttribute("open", "");
    await expect(page.getByTestId("route-share-documents").first()).toBeVisible();
    await expect(vintage).toContainText("publication year");
  });

  test("Hormuz: a two-year gap is not a mismatch, so no caveat", async ({ page }) => {
    await gotoReady(
      page,
      `/?mode=scenarios&scenario=hormuz&commodity=oil&year=${String(LATEST)}&layers=reserves`,
    );
    await expect(page.getByTestId("scenario-announcement")).toContainText(
      `${String(LATEST)} trade, 2026 route shares`,
      { timeout: RESULT_TIMEOUT },
    );
    await expect(page.getByTestId("scenario-vintage-caveat")).toHaveCount(0);
  });
});
