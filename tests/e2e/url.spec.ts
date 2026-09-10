// tests/e2e/url.spec.ts — shareable URL state: decode, encode, round-trip, no navigations.
import { test, expect, type Page, type Request } from "@playwright/test";
import {
  SPEC_TIMEOUT,
  gotoReady,
  saudiGreenness,
  setChecked,
  waitForReady,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

function params(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

test.describe("URL state", () => {
  test("a URL restores year, commodity, scenario and layers", async ({ page }) => {
    await gotoReady(page, "/?year=2015&commodity=gas&scenario=hormuz&layers=reserves,lng_terminals");

    await expect(page.locator('input[type="range"]')).toHaveValue("2015");
    await expect(page.getByRole("button", { name: "Gas" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("select").first()).toHaveValue("hormuz");

    // Not in the querystring → off.
    await expect(page.getByLabel("Basins")).not.toBeChecked();
    await expect(page.getByLabel("Extraction sites")).not.toBeChecked();
    // In the querystring → on.
    await expect(page.getByLabel("Reserves (country)")).toBeChecked();
    await expect(page.getByLabel("LNG terminals")).toBeChecked();
  });

  test("a URL without lng_voyages leaves the checkbox unchecked", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves,lng_terminals&year=2023");
    await expect(page.getByLabel("LNG voyages (2020–2024)")).not.toBeChecked();
  });

  test("flipping a toggle updates the URL", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves,basins");
    await expect(page.getByLabel("Storage hubs")).not.toBeChecked();

    await setChecked(page.getByLabel("Storage hubs"), true);
    await expect(page).toHaveURL(/layers=[^&]*storage/);
  });

  test("lon/lat/z restore the camera (canvas probe)", async ({ page }) => {
    // Zoomed in on Arabia: the Saudi probe points land at different pixels
    // than at the default view (and clear of the floating panels).
    const view = { lon: 47, lat: 23, zoom: 4 };
    await gotoReady(
      page,
      `/?layers=reserves&year=2020&lon=${String(view.lon)}&lat=${String(view.lat)}&z=${String(view.zoom)}`,
    );

    // Saudi Arabia is where the URL's camera puts it (not the default view's spot).
    await expect.poll(() => saudiGreenness(page, view), { timeout: 60_000 }).toBeGreaterThan(30);
    const p = params(page);
    expect([p.get("lon"), p.get("lat"), p.get("z")]).toEqual(["47", "23", "4"]);
  });

  test("a share link round-trips layers, year, scenario and view", async ({ page, context }) => {
    await gotoReady(page, "/?layers=reserves,pipelines&year=2020");

    await setChecked(page.getByLabel("Refineries"), true);
    await setChecked(page.getByLabel("Oil pipelines"), false);
    const slider = page.locator('input[type="range"]');
    await slider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(slider).toHaveValue("2019");
    await page.locator("select").first().selectOption("druzhba");

    // Pan the map: MapLibre's moveend writes the camera back to the store.
    const canvas = page.locator(".maplibregl-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2 + 100, { steps: 10 });
    await page.mouse.up();

    await expect(page).toHaveURL(/lon=/);
    // Let any drag inertia finish and the debounced URL write settle.
    let last = "";
    await expect
      .poll(
        async () => {
          const prev = last;
          await page.waitForTimeout(500);
          last = page.url();
          return prev === last;
        },
        { timeout: 30_000, intervals: [0] },
      )
      .toBe(true);
    await expect(page).toHaveURL(/scenario=druzhba/);
    await expect(page).toHaveURL(/year=2019/);
    await waitForReady(page);
    const shared = params(page);
    expect(shared.get("lon")).not.toBe("40");
    expect(shared.get("layers")?.split(",").sort()).toEqual(["refineries", "reserves"]);

    // Open the link in a fresh tab.
    const other = await context.newPage();
    await gotoReady(other, `/?${shared.toString()}`);
    await expect(other.locator('input[type="range"]')).toHaveValue("2019");
    await expect(other.locator("select").first()).toHaveValue("druzhba");
    await expect(other.getByLabel("Refineries")).toBeChecked();
    await expect(other.getByLabel("Reserves (country)")).toBeChecked();
    await expect(other.getByLabel("Oil pipelines")).not.toBeChecked();
    // The camera came from the link (and was not reset by the new map).
    const restored = params(other);
    for (const key of ["lon", "lat", "z", "year", "scenario", "commodity", "layers"]) {
      expect(restored.get(key), key).toBe(shared.get(key));
    }
  });

  // R16: URL state is written with history.replaceState, never router.replace,
  // so a slider tick must not trigger a Next navigation or RSC fetch.
  test("slider changes make no RSC or navigation requests", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves&year=2020");

    const offending: string[] = [];
    const isRsc = (req: Request) => {
      const url = new URL(req.url());
      return (
        url.origin === new URL(page.url()).origin &&
        url.pathname === "/" &&
        (url.searchParams.has("_rsc") || "rsc" in req.headers())
      );
    };
    page.on("request", (req) => {
      if (req.isNavigationRequest() || isRsc(req)) offending.push(`${req.method()} ${req.url()}`);
    });

    const slider = page.locator('input[type="range"]');
    await slider.focus();
    for (const expected of ["2019", "2018", "2017"]) {
      await page.keyboard.press("ArrowLeft");
      await expect(slider).toHaveValue(expected);
    }
    // The debounced replaceState has landed …
    await expect(page).toHaveURL(/year=2017/);
    await waitForReady(page);
    // … without any navigation or RSC round-trip.
    expect(offending).toEqual([]);
  });
});
