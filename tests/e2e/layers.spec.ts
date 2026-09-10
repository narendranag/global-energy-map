// tests/e2e/layers.spec.ts — the layer panel: toggles, per-layer boots, hover.
import {
  SPEC_TIMEOUT,
  collectConsoleErrors,
  countRedPixels,
  expect,
  gotoReady,
  mapBox,
  projectAll,
  saudiGreenness,
  setChecked,
  test,
  waitForReady,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

/** Every toggle in the panel, in panel order. */
const LAYER_LABELS = [
  "Reserves (country)",
  "Basins",
  "Extraction sites",
  "Oil pipelines",
  "Refineries",
  "Storage hubs",
  "Ports",
  "Gas pipelines",
  "LNG terminals",
  "LNG voyages (2020–2024)",
] as const;

/** Infrastructure (the default mode) shows exactly these five (D1). */
const DEFAULT_ON = [
  "Reserves (country)",
  "Oil pipelines",
  "Refineries",
  "Gas pipelines",
  "LNG terminals",
] as const;

/**
 * Map area clear of the floating panels (LayerPanel left, commodity + slider
 * bottom; the header is above the canvas) at 1280×720, relative to the
 * canvas; at the default view it covers Europe, Africa and the Middle East.
 */
async function mapCentreClip(page: Parameters<typeof mapBox>[0]) {
  const box = await mapBox(page);
  return { x: box.x + 320, y: box.y + 60, width: 600, height: box.height - 260 };
}

test.describe("Layer panel", () => {
  test("toggles switch off and back on", async ({ page }) => {
    await gotoReady(page, "/?layers=extraction,gas_pipelines,lng_terminals");
    for (const label of ["Extraction sites", "Gas pipelines", "LNG terminals"]) {
      const box = page.getByLabel(label, { exact: true });
      await setChecked(box, false);
      await setChecked(box, true);
    }
    await waitForReady(page);
  });

  // Starts from the full default view: the panel lists every layer with the
  // five-layer default set checked; then "only extraction" — Extraction sites
  // ticked, every default unticked — and the extraction layer must render
  // (burnt-orange site markers on the canvas).
  test("default layer set; switching to Extraction sites only keeps extraction rendered (canvas probe)", async ({
    page,
  }) => {
    // The only spec that boots the full default map and then re-renders it
    // six times; under ubuntu-latest software WebGL that alone has exceeded
    // the shared 180 s budget (CI run 34521062431), so it gets its own.
    test.setTimeout(420_000);
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/");

    for (const label of LAYER_LABELS) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    for (const label of LAYER_LABELS) {
      const box = page.getByLabel(label, { exact: true });
      if ((DEFAULT_ON as readonly string[]).includes(label)) await expect(box).toBeChecked();
      else await expect(box).not.toBeChecked();
    }
    await expect(page.getByRole("button", { name: /^Layers\s*5 on$/ })).toBeVisible();

    await setChecked(page.getByLabel("Extraction sites", { exact: true }), true, 60_000, 10_000);
    for (const label of DEFAULT_ON) {
      await setChecked(page.getByLabel(label, { exact: true }), false, 60_000, 10_000);
    }
    await expect(page.getByLabel("Extraction sites")).toBeChecked();
    await expect(page).toHaveURL(/layers=extraction(&|$)/);
    await waitForReady(page);

    const clip = await mapCentreClip(page);
    await expect.poll(() => countRedPixels(page, clip), { timeout: 60_000 }).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });

  test("unticking Reserves clears the choropleth (canvas probe)", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves&year=2020");
    await expect.poll(() => saudiGreenness(page), { timeout: 60_000 }).toBeGreaterThan(30);

    await setChecked(page.getByLabel("Reserves (country)"), false);
    await waitForReady(page);

    // Back to the bare (neutral grey) basemap.
    await expect.poll(() => saudiGreenness(page), { timeout: 60_000 }).toBeLessThan(8);
  });

  test("refineries layer boots from the URL", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?layers=refineries&year=2020");
    await expect(page.getByLabel("Refineries")).toBeChecked();
    expect(errors).toEqual([]);
  });

  test("storage + ports layers boot from the URL", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?layers=storage,ports");
    await expect(page.getByLabel("Storage hubs")).toBeChecked();
    await expect(page.getByLabel("Ports")).toBeChecked();
    expect(errors).toEqual([]);
  });

  test("LNG voyages layer boots with the checkbox checked", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/?layers=reserves,lng_terminals,lng_voyages&year=2023");
    await expect(page.getByLabel("LNG voyages (2020–2024)")).toBeChecked();
    expect(errors).toEqual([]);
  });

  test("basin tooltip on hover", async ({ page }) => {
    await gotoReady(page, "/?layers=basins");

    // Basin-dense points at the default view: Ghawar / Arabian basin, the
    // Mesopotamian foredeep, the Gulf, the Sirte basin.
    const points = await projectAll(page, [
      { lon: 49.5, lat: 25.5 },
      { lon: 45.5, lat: 32.0 },
      { lon: 51.5, lat: 27.0 },
      { lon: 19.0, lat: 29.5 },
    ]);
    await expect(async () => {
      for (const position of points) {
        await page.mouse.move(position.x, position.y);
        try {
          await expect(page.locator("body")).toContainText("Basin:", { timeout: 2_000 });
          return;
        } catch {
          // no basin under this point; try the next
        }
      }
      throw new Error("no basin tooltip at any probe point");
    }).toPass({ timeout: 60_000 });
  });

  test("pipelines.geojson is fetched exactly once on cold load", async ({ page }) => {
    // Oil and gas pipeline layers share one loader; it must cache the
    // in-flight promise, not the parsed result, or both mount-time calls fetch.
    const hits: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/data/pipelines.geojson") hits.push(req.url());
    });
    await gotoReady(page, "/?layers=pipelines,gas_pipelines&year=2020");
    expect(hits).toHaveLength(1);
  });
});
