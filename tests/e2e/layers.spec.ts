// tests/e2e/layers.spec.ts — the layer panel: toggles, per-layer boots, hover.
import { test, expect } from "@playwright/test";
import {
  SPEC_TIMEOUT,
  collectConsoleErrors,
  countRedPixels,
  gotoReady,
  project,
  saudiGreenness,
  setChecked,
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

/**
 * Map area clear of the floating panels (LayerPanel left, title bar top,
 * scenario panel right, commodity + slider bottom) at 1280×720; at the
 * default view it covers Europe, Africa and the Middle East.
 */
const MAP_CENTRE_CLIP = { x: 280, y: 120, width: 640, height: 420 };

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
  // default set checked; then "only extraction" — every other layer unticked,
  // the extraction layer must still render (red site markers on the canvas).
  test("default layer set; unticking all but Extraction sites keeps extraction rendered (canvas probe)", async ({
    page,
  }) => {
    // The only spec that boots the full nine-layer default map and then re-renders
    // it eight times; under ubuntu-latest software WebGL that alone exceeds the
    // shared 180 s budget (CI run 34521062431), so it gets its own.
    test.setTimeout(420_000);
    const errors = collectConsoleErrors(page);
    await gotoReady(page, "/");

    for (const label of LAYER_LABELS) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    // Defaults: everything but LNG voyages (opt-in; high visual noise).
    for (const label of LAYER_LABELS.slice(0, -1)) {
      await expect(page.getByLabel(label, { exact: true })).toBeChecked();
    }
    await expect(page.getByLabel("LNG voyages (2020–2024)")).not.toBeChecked();

    for (const label of LAYER_LABELS) {
      if (label === "Extraction sites") continue;
      await setChecked(page.getByLabel(label, { exact: true }), false, 60_000, 10_000);
    }
    await expect(page.getByLabel("Extraction sites")).toBeChecked();
    await expect(page).toHaveURL(/layers=extraction(&|$)/);
    await waitForReady(page);

    await expect
      .poll(() => countRedPixels(page, MAP_CENTRE_CLIP), { timeout: 60_000 })
      .toBeGreaterThan(200);
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
    const canvas = page.locator(".maplibregl-canvas");

    // Basin-dense points at the default view: Ghawar / Arabian basin, the
    // Mesopotamian foredeep, the Gulf, the Sirte basin.
    const points = [
      project(page, 49.5, 25.5),
      project(page, 45.5, 32.0),
      project(page, 51.5, 27.0),
      project(page, 19.0, 29.5),
    ];
    await expect(async () => {
      for (const position of points) {
        await canvas.hover({ position });
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
