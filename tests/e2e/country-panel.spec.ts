// tests/e2e/country-panel.spec.ts — the country panel (S3): a `?focus=` link
// opens it, it reads the right numbers out of the data, its rows navigate, and
// closing it clears the selection from the URL.
import type { Page } from "@playwright/test";
import { SPEC_TIMEOUT, expect, gotoReady, project, test } from "./helpers";
import type { MapView } from "../../src/lib/state/view";
import { SCENARIOS, isScenarioActive } from "../../src/lib/scenarios/registry";

test.setTimeout(SPEC_TIMEOUT);

/**
 * Japan's largest crude supplier in BACI 2024, verified against
 * `public/data/trade_flow.parquet` before it was written here:
 *
 *   ARE 49.5 Mt, SAU 46.4 Mt, KWT 8.1 Mt, QAT 4.6 Mt, USA 2.8 Mt
 *
 * The name is the Natural Earth one from `countries.geojson`, which is what
 * the panel renders.
 */
const JAPAN_TOP_SUPPLIER = { iso3: "ARE", name: "United Arab Emirates" };

function focusParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get("focus");
}

/** The panel's sections load after `data-ready`; give them their own budget. */
const SECTION_TIMEOUT = 60_000;

test.describe("country panel", () => {
  test("?focus=JPN shows Japan, its trade and its top crude supplier", async ({ page }) => {
    await gotoReady(page, "/?focus=JPN&year=2024&layers=reserves");

    const panel = page.getByTestId("country-panel");
    // The header paints from data the focus outline already loaded — it must
    // not wait on BACI.
    await expect(panel.getByRole("heading", { level: 2, name: /Japan/ })).toBeVisible();

    const suppliers = page.getByTestId("country-suppliers");
    await expect(suppliers).toBeVisible({ timeout: SECTION_TIMEOUT });
    const first = suppliers.getByRole("button").first();
    await expect(first).toContainText(JAPAN_TOP_SUPPLIER.name);
    await expect(first).toContainText(JAPAN_TOP_SUPPLIER.iso3);
    // Every section is dated and attributed from the catalog, never by hand.
    await expect(page.getByTestId("country-trade")).toContainText(/Source: BACI \(CEPII\) \(as of /);

    // Japan has no Energy Institute rows at all, so that section is absent
    // rather than showing zeroes.
    await expect(page.getByTestId("country-reserves")).toHaveCount(0);
  });

  test("a producer gets reserves and production sparklines with a text alternative", async ({
    page,
  }) => {
    await gotoReady(page, "/?focus=SAU&year=2020&layers=reserves");
    const reserves = page.getByTestId("country-reserves");
    await expect(reserves).toBeVisible({ timeout: SECTION_TIMEOUT });
    await expect(reserves).toContainText("Proved oil reserves");
    await expect(reserves).toContainText("Oil production (total liquids)");
    // Two sparklines, each an image with a spoken description of the shape.
    const charts = reserves.getByRole("img");
    await expect(charts).toHaveCount(2);
    await expect(charts.first()).toHaveAttribute("aria-label", /Proved oil reserves, 1990–2020:/);
    await expect(reserves).toContainText(/Source: Energy Institute/);
  });

  test("exposure lists every applicable scenario and activating one selects it", async ({ page }) => {
    await gotoReady(page, "/?focus=JPN&year=2024&layers=reserves");
    const rows = page.getByTestId("country-exposure-rows");
    await expect(rows).toBeVisible({ timeout: SECTION_TIMEOUT });
    // Every oil scenario the registry holds for 2024, so adding one does not
    // silently stop appearing here.
    await expect(rows.getByRole("button")).toHaveCount(
      SCENARIOS.filter((s) => s.commodities.includes("oil") && isScenarioActive(s, 2024)).length,
    );
    // Ranked by share, descending — which scenario tops the list is data, not
    // something to pin here.
    const shares = await rows.getByRole("button").allInnerTexts();
    const pcts = shares.map((t) => Number(/([\d.]+)%/.exec(t)?.[1] ?? "NaN"));
    expect(pcts.every(Number.isFinite)).toBe(true);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);

    const hormuz = rows.getByRole("button").filter({ hasText: "Close Strait of Hormuz" });
    await expect(hormuz).toHaveCount(1);
    await hormuz.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("scenario"), { timeout: 15_000 })
      .toBe("hormuz");
    await expect(page.getByTestId("scenario-slot")).toBeVisible();
    // Both panels are open at once: the country panel keeps its own column.
    await expect(page.getByTestId("country-panel")).toBeVisible();
  });

  test("clicking a supplier refocuses the map on that country", async ({ page }) => {
    await gotoReady(page, "/?focus=JPN&year=2024&layers=reserves");
    const suppliers = page.getByTestId("country-suppliers");
    await expect(suppliers).toBeVisible({ timeout: SECTION_TIMEOUT });

    await suppliers.getByRole("button").first().click();
    await expect.poll(() => focusParam(page), { timeout: 15_000 }).toBe(JAPAN_TOP_SUPPLIER.iso3);
    await expect(
      page.getByTestId("country-panel").getByRole("heading", { level: 2, name: /United Arab Emirates/ }),
    ).toBeVisible();
  });

  test("closing the panel clears focus from the URL", async ({ page }) => {
    await gotoReady(page, "/?focus=JPN&year=2024&layers=reserves");
    await expect(page.getByTestId("country-panel")).toBeVisible();

    await page.getByRole("button", { name: /^Close Japan/ }).click();
    await expect.poll(() => focusParam(page), { timeout: 15_000 }).toBeNull();
    await expect(page.getByTestId("country-panel")).toHaveCount(0);
  });

  test("the CSV offer says what it must leave out, and why", async ({ page }) => {
    await gotoReady(page, "/?focus=SAU&year=2020&layers=reserves");
    await expect(page.getByTestId("country-csv")).toBeVisible({ timeout: SECTION_TIMEOUT });
    const note = page.getByTestId("country-csv-note");
    // Saudi Arabia has Energy Institute reserves and NETL+OSM refineries:
    // both are view-only, and the panel says so before the download.
    await expect(note).toContainText("reserves");
    await expect(note).toContainText("do not allow redistribution");
  });

  test("a map click opens the panel without taking focus from the map", async ({ page }) => {
    // An explicit camera (so nothing moves under the click) with interior
    // Saudi Arabia clear of both side panels.
    const view: MapView = { lon: 47, lat: 23, zoom: 4 };
    await gotoReady(page, "/?layers=reserves&year=2020&lon=47&lat=23&z=4");
    const point = await project(page, 44.0, 21.5, view);
    await page.mouse.click(point.x, point.y);

    await expect.poll(() => focusParam(page), { timeout: 15_000 }).toBe("SAU");
    await expect(page.getByTestId("country-panel")).toBeVisible();
    // The panel heading is focusable, but a pointer selection must not steal
    // focus into it: the user is still working the map.
    await expect(page.getByTestId("country-panel").getByRole("heading", { level: 2 })).not.toBeFocused();
  });
});
