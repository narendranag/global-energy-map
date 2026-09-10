import { test, expect } from "@playwright/test";

// Guards R9 (basemap container collapsed to 0 px because maplibre-gl.css's
// unlayered `.maplibregl-map { position: relative }` beat Tailwind's layered
// `absolute inset-0`) and D15 (OpenStreetMap / OpenMapTiles attribution must be visible).
test.setTimeout(180_000);

test("OpenFreeMap basemap renders full-size with visible attribution", async ({ page }) => {
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err.message);
  });

  // Register before navigation so the first tile responses are not missed.
  const tileResponse = page.waitForResponse(
    (res) => res.url().includes("tiles.openfreemap.org") && res.url().endsWith(".pbf") && res.status() === 200,
    { timeout: 120_000 },
  );

  await page.goto("/");

  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, { timeout: 60_000 })
    .toBeGreaterThan(300);

  await tileResponse;

  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution).toBeVisible({ timeout: 60_000 });
  await expect(attribution).toContainText("OpenMapTiles", { timeout: 60_000 });
  await expect(attribution).toContainText("OpenStreetMap");
});
