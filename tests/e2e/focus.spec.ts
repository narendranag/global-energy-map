// tests/e2e/focus.spec.ts — country selection (S0): `?focus=` restores it, the
// outline is really drawn, clicking selects and Escape clears.
import type { Page } from "@playwright/test";
import {
  SPEC_TIMEOUT,
  countPixels,
  expect,
  gotoReady,
  mapBox,
  project,
  test,
  type Rgb,
} from "./helpers";
import type { MapView } from "../../src/lib/state/view";

test.setTimeout(SPEC_TIMEOUT);

/**
 * A view that puts Japan in the middle of the canvas and keeps it clear of
 * the left layer panel. Explicit, so the load-time fit must not fire.
 */
const JAPAN_VIEW: MapView = { lon: 138, lat: 37, zoom: 4 };
/** Well inside Honshū, clear of the coast. */
const HONSHU = { lon: 138.0, lat: 36.2 };
/** Interior Saudi Arabia (the SAUDI_POINTS the other specs probe). */
const SAUDI = { lon: 44.0, lat: 21.5 };

const LAYERS = "layers=reserves";

function url(extra: string, view: MapView): string {
  return `/?${LAYERS}&year=2020&${extra}lon=${String(view.lon)}&lat=${String(view.lat)}&z=${String(view.zoom)}`;
}

/**
 * The focus outline is a near-black (#101a24) cased line; nothing else on the
 * map is that dark. Count those pixels in a box around the country.
 */
const isOutline = (c: Rgb): boolean => c.r < 70 && c.g < 80 && c.b < 90;

async function outlinePixels(page: Page, at: { lon: number; lat: number }, view: MapView) {
  const box = await mapBox(page);
  const centre = await project(page, at.lon, at.lat, view);
  const half = 220;
  const clip = {
    x: Math.max(box.x, centre.x - half),
    y: Math.max(box.y, centre.y - half),
    width: Math.min(2 * half, box.width - 1),
    height: Math.min(2 * half, box.height - 1),
  };
  return countPixels(page, clip, isOutline);
}

function focusParam(page: Page): string | null {
  return new URL(page.url()).searchParams.get("focus");
}

test.describe("country focus", () => {
  test("?focus=JPN outlines Japan and leaves an explicit camera alone", async ({ page }) => {
    await gotoReady(page, url("", JAPAN_VIEW));
    const before = await outlinePixels(page, HONSHU, JAPAN_VIEW);

    await gotoReady(page, url("focus=JPN&", JAPAN_VIEW));
    expect(focusParam(page)).toBe("JPN");

    // The outline is actually painted…
    await expect
      .poll(() => outlinePixels(page, HONSHU, JAPAN_VIEW), { timeout: 30_000 })
      .toBeGreaterThan(before + 200);

    // …and the explicit lon/lat/z in the link won: no fit-to-country on load.
    const params = new URL(page.url()).searchParams;
    expect(Number(params.get("z"))).toBeCloseTo(JAPAN_VIEW.zoom, 1);
    expect(Number(params.get("lon"))).toBeCloseTo(JAPAN_VIEW.lon, 0);
  });

  test("Escape clears the selection and removes the outline", async ({ page }) => {
    await gotoReady(page, url("focus=JPN&", JAPAN_VIEW));
    const focused = await outlinePixels(page, HONSHU, JAPAN_VIEW);

    await page.keyboard.press("Escape");

    await expect.poll(() => focusParam(page), { timeout: 15_000 }).toBeNull();
    await expect
      .poll(() => outlinePixels(page, HONSHU, JAPAN_VIEW), { timeout: 30_000 })
      .toBeLessThan(focused);
  });

  test("an unknown code is dropped rather than drawn", async ({ page }) => {
    // The URL still reads focus=ZZZ — nothing changed state, so nothing
    // rewrote it — but the app decoded it as "no selection".
    await gotoReady(page, url("focus=JPN&", JAPAN_VIEW));
    const focused = await outlinePixels(page, HONSHU, JAPAN_VIEW);

    await gotoReady(page, url("focus=ZZZ&", JAPAN_VIEW));
    expect(await outlinePixels(page, HONSHU, JAPAN_VIEW)).toBeLessThan(focused);
  });

  test("clicking a country selects it; clicking it again clears it", async ({ page }) => {
    const view: MapView = { lon: 47, lat: 23, zoom: 4 };
    await gotoReady(page, url("", view));
    const point = await project(page, SAUDI.lon, SAUDI.lat, view);

    await page.mouse.click(point.x, point.y);
    await expect.poll(() => focusParam(page), { timeout: 15_000 }).toBe("SAU");

    await page.mouse.click(point.x, point.y);
    await expect.poll(() => focusParam(page), { timeout: 15_000 }).toBeNull();
  });
});
