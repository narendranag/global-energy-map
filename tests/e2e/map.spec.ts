// tests/e2e/map.spec.ts — the map itself: basemap, chrome, and rendered fills.
import { test, expect } from "@playwright/test";
import {
  SPEC_TIMEOUT,
  collectConsoleErrors,
  gotoReady,
  greenness,
  press,
  project,
  samplePixels,
  saudiGreenness,
  SAUDI_POINTS,
  waitForReady,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

test.describe("Map", () => {
  // Guards R9 (basemap container collapsed to 0 px because maplibre-gl.css's
  // unlayered `.maplibregl-map { position: relative }` beat Tailwind's layered
  // `absolute inset-0`) and D15 (OpenStreetMap / OpenMapTiles attribution
  // must be visible).
  test("OpenFreeMap basemap renders full-size with tiles, labels and attribution", async ({
    page,
  }) => {
    // Register before navigation so the first responses are not missed.
    const tileResponse = page.waitForResponse(
      (res) =>
        res.url().includes("tiles.openfreemap.org") &&
        res.url().endsWith(".pbf") &&
        !res.url().includes("/fonts/") &&
        res.status() === 200,
      { timeout: 120_000 },
    );
    // Basemap labels: MapLibre only fetches glyph ranges for symbols it draws.
    const glyphResponse = page.waitForResponse(
      (res) => res.url().includes("/fonts/") && res.status() === 200,
      { timeout: 120_000 },
    );

    await gotoReady(page, "/?layers=reserves");

    const canvas = page.locator(".maplibregl-canvas");
    await expect
      .poll(async () => (await canvas.boundingBox())?.height ?? 0, { timeout: 60_000 })
      .toBeGreaterThan(300);

    await tileResponse;
    await glyphResponse;

    const attribution = page.locator(".maplibregl-ctrl-attrib");
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText("OpenMapTiles");
    await expect(attribution).toContainText("OpenStreetMap");
  });

  // The one full default-view load in this spec: all nine default layers.
  test("default view: title bar, controls, every default layer loaded, no fatal errors", async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/");

    // Phase 7: title bar with an <h1> and a link to the methodology page.
    await expect(page.getByRole("heading", { level: 1, name: "Global Energy Map" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Methodology & sources" })).toBeVisible();

    await expect(page.locator('input[type="range"]')).toBeVisible();
    await expect(page.locator("select").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Oil" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Gas" })).toBeVisible();

    // data-ready ⇒ no layer still loading ⇒ no loading pill.
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  // R30 canvas probe: the reserves fill is actually drawn, not just loaded.
  // Saudi Arabia is near the top of the oil ramp (dark green); the basemap is
  // neutral grey, so the pixel's green cast proves deck painted the polygon.
  test("reserves choropleth paints Saudi Arabia (canvas probe)", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves&year=2020");

    await expect.poll(() => saudiGreenness(page), { timeout: 60_000 }).toBeGreaterThan(30);

    // Control: open ocean in the Arabian Sea carries no green cast.
    const [ocean] = await samplePixels(page, [project(page, 64, 12)]);
    expect(ocean && greenness(ocean)).toBeLessThan(10);
  });

  test("commodity toggle restyles the choropleth (canvas probe)", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves&year=2020");
    await expect.poll(() => saudiGreenness(page), { timeout: 60_000 }).toBeGreaterThan(30);

    const probe = project(page, SAUDI_POINTS[0].lon, SAUDI_POINTS[0].lat);
    const [oil] = await samplePixels(page, [probe]);
    if (!oil) throw new Error("no pixel");

    await press(page.getByRole("button", { name: "Gas" }));
    await waitForReady(page);

    // Saudi gas reserves sit lower on the gas ramp than its oil reserves on
    // the oil ramp, so the fill turns lighter.
    await expect
      .poll(
        async () => {
          const [gas] = await samplePixels(page, [probe]);
          return gas ? Math.abs(gas.r - oil.r) + Math.abs(gas.g - oil.g) : 0;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(20);
    await expect.poll(() => saudiGreenness(page), { timeout: 60_000 }).toBeGreaterThan(10);
  });
});
