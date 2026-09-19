// tests/e2e/trade-flows.spec.ts — Trade flows (BACI): boots from the URL,
// has no data before BACI's 1995 start, world view draws arcs, and focusing
// a country narrows the drawn set (S2).
import {
  SPEC_TIMEOUT,
  collectConsoleErrors,
  countPixels,
  expect,
  gotoReady,
  mapBox,
  test,
  type Rgb,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

/**
 * Composited-over-basemap check for the layer's arc colours: oil runs pale
 * gold → burnt umber (warm: red channel leads blue), gas runs pale cyan →
 * deep blue (cool: blue channel leads red). The basemap (near-neutral land
 * `#f2f3f0` / water `#c2c8ca`) fails both by a wide margin, so no other
 * layer needs to be off for these to be unambiguous — but every spec here
 * isolates the layer anyway (`layers=trade_flows`) so a probe only ever
 * proves this layer drew something.
 */
const isWarmArc = (c: Rgb): boolean => c.r - c.b > 25 && c.r >= c.g;
const isCoolArc = (c: Rgb): boolean => c.b - c.r > 25 && c.b >= c.g;

/**
 * Map area clear of the floating panels (LayerPanel left, commodity + slider
 * bottom) at 1280×720 — the same box `layers.spec.ts` probes with. Without
 * this, a full-canvas screenshot also samples the panel chrome sitting on
 * top of the map (e.g. the amber "old" data-vintage badge is itself
 * warm-toned and would read as a false positive).
 */
async function mapCentreClip(page: Parameters<typeof mapBox>[0]) {
  const box = await mapBox(page);
  return { x: box.x + 320, y: box.y + 60, width: 600, height: box.height - 260 };
}

async function countArcPixels(page: Parameters<typeof mapBox>[0], match: (c: Rgb) => boolean) {
  const clip = await mapCentreClip(page);
  return countPixels(page, clip, match);
}

test.describe("Trade flows (BACI)", () => {
  test("boots from the URL: checkbox checked, badged with BACI's year range", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?layers=trade_flows&commodity=oil&year=2024");
    await expect(page.getByLabel("Trade flows (BACI)", { exact: true })).toBeChecked();
    await expect(page.getByTestId("time-badge-trade_flows")).toHaveText("time: 1995–2024");
    expect(errors).toEqual([]);
  });

  test("before BACI's 1995 start, the layer is on but draws nothing — no error", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?layers=trade_flows&commodity=oil&year=1990");
    await expect(page.getByLabel("Trade flows (BACI)", { exact: true })).toBeChecked();
    expect(await countArcPixels(page, isWarmArc)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("world view draws arcs along the largest pairs (pixel probe)", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    // Default view (lon 40, lat 25, zoom 2) holds the Middle East, Africa and
    // most of Asia in frame — SAU and CHN (one of the largest crude pairs
    // every year in this range) are both on screen without an explicit camera.
    await gotoReady(page, "/?layers=trade_flows&commodity=oil&year=2024");
    await expect.poll(() => countArcPixels(page, isWarmArc), { timeout: 60_000 }).toBeGreaterThan(20);
    expect(errors).toEqual([]);
  });

  test("focusing a country narrows the drawn set (fewer arcs than world view)", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?layers=trade_flows&commodity=gas&year=2023");
    await expect.poll(() => countArcPixels(page, isCoolArc), { timeout: 60_000 }).toBeGreaterThan(0);
    const worldCount = await countArcPixels(page, isCoolArc);

    await gotoReady(page, "/?layers=trade_flows&commodity=gas&year=2023&focus=JPN");
    await expect(page.getByLabel("Trade flows (BACI)", { exact: true })).toBeChecked();
    const focusCount = await countArcPixels(page, isCoolArc);

    expect(focusCount).toBeGreaterThan(0);
    expect(focusCount).toBeLessThan(worldCount);
    expect(errors).toEqual([]);
  });
});
