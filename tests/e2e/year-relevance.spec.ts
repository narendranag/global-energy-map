// The year control collapses to a chip when nothing on screen reads the year,
// and comes back the moment something does. The year itself never leaves the
// model (the scenario engine is year-parameterised), so this is presentation
// only — `?year=` in a shared link must survive a collapsed render untouched.
import type { Locator, Page } from "@playwright/test";
import { SPEC_TIMEOUT, expect, gotoReady, test, yearSlider } from "./helpers";

test.describe.configure({ timeout: SPEC_TIMEOUT });

const chip = (page: Page): Locator => page.getByTestId("year-expand");
const control = (page: Page): Locator => page.getByTestId("year-slider");

// refineries, storage and ports are the three layers with no dates at all.
const IDLE = "/?layers=refineries,storage,ports&year=2015";
const DATED = "/?layers=refineries,pipelines&year=2015";

test("collapses to a chip when every visible layer is undated", async ({ page }) => {
  await gotoReady(page, IDLE);
  await expect(control(page)).toHaveAttribute("data-collapsed", "true");
  await expect(chip(page)).toBeVisible();
  await expect(yearSlider(page)).toBeHidden();
  // Collapsed is not "forgotten": the year is still on show, and still 2015.
  await expect(page.getByTestId("year-value")).toHaveText("2015");
});

test("stays expanded when a dated layer is on", async ({ page }) => {
  await gotoReady(page, DATED);
  await expect(control(page)).not.toHaveAttribute("data-collapsed", "true");
  await expect(yearSlider(page)).toBeVisible();
});

test("a scenario keeps it expanded even with only undated layers", async ({ page }) => {
  await gotoReady(page, "/?mode=scenarios&scenario=hormuz&layers=refineries,ports&year=2020");
  await expect(yearSlider(page)).toBeVisible();
  await expect(chip(page)).toBeHidden();
});

test("the chip opens the full timeline on click", async ({ page }) => {
  await gotoReady(page, IDLE);
  await chip(page).click();
  await expect(yearSlider(page)).toBeVisible();
  await expect(chip(page)).toBeHidden();
});

test("collapsing does not rewrite the year in the URL", async ({ page }) => {
  await gotoReady(page, IDLE);
  await expect(control(page)).toHaveAttribute("data-collapsed", "true");
  // The debounced replaceState must not drop or normalise year= just because
  // the control that edits it is collapsed.
  await expect.poll(() => new URL(page.url()).searchParams.get("year"), { timeout: 10_000 }).toBe(
    "2015",
  );
});
