// tests/e2e/scenario-map.spec.ts — S1: the scenario on the map. The closure
// mark, the highlighted cut route, the camera on activation, and the ranked
// rows ↔ map link.
//
// Every probe here pins the camera with an explicit lon/lat/z, both because
// `project()` needs to know the view and because that is the rule under test:
// a link's view is never overridden.
import {
  SPEC_TIMEOUT,
  collectConsoleErrors,
  countPixels,
  expect,
  gotoReady,
  openLayers,
  project,
  scenarioSelect,
  test,
  waitForReady,
} from "./helpers";
import type { MapView } from "../../src/lib/state/view";

test.setTimeout(SPEC_TIMEOUT);

/** Scenario results can queue behind the default-layer loads (CLAUDE.md). */
const RESULT_TIMEOUT = 120_000;

/** The narrowest point of the Strait of Hormuz — `SCENARIOS.hormuz.location`. */
const HORMUZ = { lon: 56.25, lat: 26.57 };

/**
 * A vertex of P0644 (Baku-Tbilisi-Ceyhan) in `public/data/pipelines.geojson`,
 * inside Azerbaijan. Azerbaijan is the scenario's *exporter*, so no exposure
 * fill is painted there and any vivid red under the probe is the cut route.
 */
const BTC_VERTEX = { lon: 45.11089, lat: 41.46576 };

/** deck.gl's mark red (#d21024) and nothing else on the pale basemap. */
const isMarkRed = (c: { r: number; g: number; b: number }) =>
  c.r > 150 && c.g < 90 && c.b < 90;

/** A box around a projected point, clipped to the viewport. */
function boxAround(p: { x: number; y: number }, half: number) {
  return { x: Math.max(0, p.x - half), y: Math.max(0, p.y - half), width: half * 2, height: half * 2 };
}

/** The view params the store wrote into the URL, as one comparable string. */
function viewOf(url: string): string {
  const p = new URL(url).searchParams;
  return ["lon", "lat", "z"].map((k) => p.get(k) ?? "").join(",");
}

test.describe("Scenario on the map", () => {
  test("a chokepoint scenario marks the strait itself", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const view: MapView = { lon: HORMUZ.lon, lat: HORMUZ.lat, zoom: 5 };
    // Both loads carry the scenario in the URL rather than picking it in
    // session, so the camera stays exactly where `project()` thinks it is.
    const url = (scenario: string) =>
      `/?mode=scenarios&layers=reserves&year=2020${scenario}` +
      `&lon=${view.lon.toString()}&lat=${view.lat.toString()}&z=${view.zoom.toString()}`;

    // Nothing marks the strait with no scenario active.
    await gotoReady(page, url(""));
    const at = await project(page, HORMUZ.lon, HORMUZ.lat, view);
    const clip = boxAround(at, 24);
    expect(await countPixels(page, clip, isMarkRed)).toBe(0);

    await gotoReady(page, url("&scenario=hormuz"));
    await expect
      .poll(async () => countPixels(page, clip, isMarkRed), { timeout: RESULT_TIMEOUT })
      .toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });

  test("a pipeline scenario highlights its route, with the pipelines layer off", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    const view: MapView = { lon: BTC_VERTEX.lon, lat: BTC_VERTEX.lat, zoom: 6 };
    const url = (scenario: string) =>
      `/?mode=scenarios&layers=reserves&year=2020${scenario}` +
      `&lon=${view.lon.toString()}&lat=${view.lat.toString()}&z=${view.zoom.toString()}`;

    await gotoReady(page, url(""));
    const at = await project(page, BTC_VERTEX.lon, BTC_VERTEX.lat, view);
    const clip = boxAround(at, 30);
    expect(await countPixels(page, clip, isMarkRed)).toBe(0);

    // `layers=reserves` only: the oil-pipelines toggle stays off, because the
    // cut route is the subject of the scenario, not a layer the viewer chose.
    await gotoReady(page, url("&scenario=btc"));
    await expect
      .poll(async () => countPixels(page, clip, isMarkRed), { timeout: RESULT_TIMEOUT })
      .toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });

  test("picking a scenario moves the camera; loading one with a view in the link does not", async ({
    page,
  }) => {
    // (a) picked in session → the view is refitted to mark + top importers.
    await gotoReady(page, "/?mode=scenarios&layers=reserves&year=2020");
    const before = viewOf(page.url());
    await scenarioSelect(page).selectOption("hormuz");
    await waitForReady(page);
    await expect.poll(() => viewOf(page.url()), { timeout: RESULT_TIMEOUT }).not.toBe(before);

    // (b) arrived with an explicit camera → it is exactly what stays.
    const pinned = "lon=10&lat=50&z=4";
    await gotoReady(page, `/?mode=scenarios&scenario=hormuz&layers=reserves&year=2020&${pinned}`);
    await expect(page.getByTestId("ranked-importers").locator("li").first()).toBeVisible({
      timeout: RESULT_TIMEOUT,
    });
    await waitForReady(page);
    expect(viewOf(page.url())).toBe("10,50,4");
  });

  test("a ranked importer row selects its country", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&layers=reserves&year=2020&lon=40&lat=25&z=2");
    const rows = page.getByTestId("ranked-importers").locator("li button");
    await expect(rows.first()).toBeVisible({ timeout: RESULT_TIMEOUT });
    await rows.first().click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("focus"), { timeout: 30_000 })
      .toMatch(/^[A-Z]{3}$/);
  });

  test("the legend names the mark only while a scenario is active", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&layers=reserves&year=2020&lon=40&lat=25&z=2");
    // The legend lives inside the Layers disclosure, closed in Scenarios mode.
    await openLayers(page);
    const legend = page.getByTestId("legend");
    await expect(legend).not.toContainText("Closed chokepoint");

    await scenarioSelect(page).selectOption("hormuz");
    await expect(legend).toContainText("Closed chokepoint", { timeout: RESULT_TIMEOUT });

    await scenarioSelect(page).selectOption("btc");
    await expect(legend).toContainText("Cut route", { timeout: RESULT_TIMEOUT });
    await expect(legend).not.toContainText("Closed chokepoint");
  });
});
