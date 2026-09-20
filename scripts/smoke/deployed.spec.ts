// scripts/smoke/deployed.spec.ts — the deployed map boots end to end: every
// default layer reaches `data-ready`, and a basemap tile arrives. DuckDB is
// deliberately NOT on this path (it loads only on /query); the HTTP smoke in
// smoke.mjs HEADs the bundle instead.
// Run via scripts/smoke/playwright.config.ts (SMOKE_URL); not part of the
// local e2e suite.
import { SPEC_TIMEOUT, expect, test, waitForReady } from "../../tests/e2e/helpers";

test.setTimeout(SPEC_TIMEOUT);

test("deployed / reaches data-ready with a basemap tile and no error panel", async ({ page }) => {
  // Optional: Vercel "Protection Bypass for Automation". The query form sets a
  // first-party cookie, so the secret is never sent to the tile host.
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    await page.goto(
      `/?x-vercel-protection-bypass=${encodeURIComponent(bypass)}&x-vercel-set-bypass-cookie=true`,
    );
  }

  const tile = page.waitForResponse(
    (res) =>
      res.url().includes("tiles.openfreemap.org") &&
      res.url().endsWith(".pbf") &&
      !res.url().includes("/fonts/") &&
      res.status() === 200,
    { timeout: 120_000 },
  );
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/");
  await waitForReady(page);
  await tile;

  await expect(page.getByTestId("app-error")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
