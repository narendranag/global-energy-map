// tests/e2e/search.spec.ts — header search (S4): lazy index, country + asset
// selection, keyboard-only flow, and the cold-load network guard.
import type { Page } from "@playwright/test";
import { SPEC_TIMEOUT, expect, gotoReady, openLayers, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

function searchBox(page: Page) {
  return page.getByRole("combobox", { name: "Search the map" });
}

function urlParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

test.describe("search", () => {
  test("typing a country name and pressing Enter focuses it and moves the camera", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves");
    const input = searchBox(page);
    await input.click();
    await input.fill("Japan");
    // Several assets have "Japan" in their own name too (e.g. a gas field's
    // parenthetical); the country ranks first, so pin to the top option
    // rather than any option matching the name.
    const firstOption = page.getByRole("listbox").getByRole("option").first();
    await expect(firstOption).toHaveText(/^Japan/);

    await input.press("Enter");
    await expect.poll(() => urlParams(page).get("focus"), { timeout: 15_000 }).toBe("JPN");
    // Japan sits around 128–146°E, 30–46°N — the camera actually moved there,
    // not just left at the world-view default (lon 40).
    await expect
      .poll(() => Number(urlParams(page).get("lon")), { timeout: 15_000 })
      .toBeGreaterThan(120);
  });

  test("an exact ISO3 code wins over a name match", async ({ page }) => {
    await gotoReady(page, "/?layers=");
    const input = searchBox(page);
    await input.click();
    await input.fill("JPN");
    await expect(page.getByRole("option").first()).toHaveText(/Japan/);
  });

  test("selecting an LNG terminal flies to it and turns its layer on", async ({ page }) => {
    // Verified against public/data/assets.parquet (uv run python + duckdb):
    // exactly one row named "Futtsu LNG Terminal", JPN, lon 139.821331 lat 35.345172.
    await gotoReady(page, "/?layers=");
    const input = searchBox(page);
    await input.click();
    await input.fill("Futtsu LNG Terminal");
    const option = page.getByRole("option", { name: /Futtsu LNG Terminal/ });
    await expect(option).toBeVisible();
    await option.click();

    await expect
      .poll(() => Number(urlParams(page).get("lon")), { timeout: 15_000 })
      .toBeCloseTo(139.82, 1);
    await expect
      .poll(() => Number(urlParams(page).get("lat")), { timeout: 15_000 })
      .toBeCloseTo(35.35, 1);

    await openLayers(page);
    await expect(page.getByLabel("LNG terminals")).toBeChecked();
  });

  test("keyboard-only: \"/\" focuses the box, arrow keys move the selection, Enter commits", async ({
    page,
  }) => {
    await gotoReady(page, "/?layers=");
    await page.keyboard.press("/");
    await expect(searchBox(page)).toBeFocused();

    await page.keyboard.type("Japan");
    // Wait for a real option (not just the — always-mounted — listbox
    // wrapper): the index loads asynchronously, and arrow/Enter presses sent
    // while it is still empty would silently no-op.
    const firstOption = page.getByRole("listbox").getByRole("option").first();
    await expect(firstOption).toHaveText(/^Japan/);
    // Down then back up: proves the arrow keys move the active option, and
    // Enter still lands on the (still top-ranked) country.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");

    await expect.poll(() => urlParams(page).get("focus"), { timeout: 15_000 }).toBe("JPN");
  });

  test("Escape closes the list before it clears the text", async ({ page }) => {
    await gotoReady(page, "/?layers=");
    const input = searchBox(page);
    await input.click();
    await input.fill("Japan");
    await expect(input).toHaveAttribute("aria-expanded", "true");

    await page.keyboard.press("Escape");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).toHaveValue("Japan");

    await page.keyboard.press("Escape");
    await expect(input).toHaveValue("");
  });

  test("nothing beyond the always-loaded countries is fetched before the box is used", async ({
    page,
  }) => {
    const requested: string[] = [];
    page.on("request", (req) => {
      const path = new URL(req.url()).pathname;
      if (path.startsWith("/data/")) requested.push(path);
    });

    // Every layer off: nothing but the always-on country pick target loads.
    await gotoReady(page, "/?layers=");
    const before = [...requested];
    expect(before.some((p) => p.includes("assets.parquet"))).toBe(false);
    expect(before.some((p) => p.includes("pipelines.geojson"))).toBe(false);
    expect(before.some((p) => p.includes("basins.geojson"))).toBe(false);
    expect(before.some((p) => p.includes("shale_regions.geojson"))).toBe(false);

    const input = searchBox(page);
    await input.click();
    await input.fill("a");

    for (const marker of ["assets.parquet", "pipelines.geojson", "basins.geojson", "shale_regions.geojson"]) {
      await expect
        .poll(() => requested.some((p) => p.includes(marker)), { timeout: 15_000 })
        .toBe(true);
    }
  });
});
