// tests/e2e/data.spec.ts — /data: downloads only for redistributable files; /about redirects.
import fs from "node:fs";
import path from "node:path";
import { SPEC_TIMEOUT, expect, headerLink, test, waitForReady, clickUntil } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

interface Entry {
  readonly id: string;
  readonly path: string;
  readonly downloadable?: boolean;
  readonly sha256?: string;
}

const CATALOG = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public", "data", "catalog.json"), "utf8"),
) as { entries: Entry[] };

/**
 * The deploy-scoped download URL the app builds (dataUrl()): `<path>?v=` +
 * the first 8 hex of the file's catalog sha256 (exact when the catalog has
 * the hash, else any 8-hex version).
 */
function versioned(p: string): string | RegExp {
  const sha = CATALOG.entries.find((e) => e.path === p && e.sha256)?.sha256;
  if (sha) return `${p}?v=${sha.slice(0, 8)}`;
  return new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=[0-9a-f]{8}$`);
}

test.describe("/data", () => {
  test("offers Download only for entries flagged downloadable", async ({ page }) => {
    await page.goto("/data");
    await expect(page.getByRole("heading", { level: 1, name: "Data" })).toBeVisible();

    // One row per catalog entry.
    await expect(page.locator('tr[data-testid^="data-row-"]')).toHaveCount(CATALOG.entries.length);

    const downloadable = CATALOG.entries.filter((e) => e.downloadable === true);
    const viewOnly = CATALOG.entries.filter((e) => e.downloadable !== true);
    expect(downloadable.length).toBeGreaterThan(0);
    expect(viewOnly.length).toBeGreaterThan(0);

    for (const e of downloadable) {
      const row = page.getByTestId(`data-row-${e.id}`);
      const link = row.getByRole("link", { name: "Download" });
      // Sha-versioned URL (immutable caching): `<path>?v=<sha256[:8]>`.
      await expect(link, e.id).toHaveAttribute("href", versioned(e.path));
      await expect(row.getByTestId(`view-only-${e.id}`)).toHaveCount(0);
    }
    for (const e of viewOnly) {
      const row = page.getByTestId(`data-row-${e.id}`);
      await expect(row.getByRole("link", { name: "Download" }), e.id).toHaveCount(0);
      await expect(row.getByTestId(`view-only-${e.id}`)).toContainText("View-only.");
    }

    // The licence-restricted sources are view-only by name.
    for (const id of ["ei_country_year", "osm_refineries"]) {
      await expect(page.getByTestId(`view-only-${id}`)).toBeVisible();
    }
    // BACI's trade extract is downloadable (Etalab Open Licence 2.0).
    await expect(page.getByTestId("download-baci_2709")).toHaveAttribute(
      "href",
      versioned("/data/trade_flow.parquet"),
    );
  });

  test("a downloadable file is served", async ({ page, request }) => {
    await page.goto("/data");
    const href = await page.getByTestId("download-netl_basins").getAttribute("href");
    const want = versioned("/data/basins.geojson");
    if (typeof want === "string") expect(href).toBe(want);
    else expect(href).toMatch(want);
    const res = await request.head(href ?? "");
    expect(res.status()).toBe(200);
  });

  test("header Data link opens /data", async ({ page }) => {
    await page.goto("/?layers=");
    await waitForReady(page);
    await clickUntil(headerLink(page, "Data"), async () => {
      await expect(page).toHaveURL(/\/data$/, { timeout: 5_000 });
    });
    await expect(page.getByRole("heading", { level: 1, name: "Data" })).toBeVisible();
  });
});

test.describe("/about", () => {
  test("permanently redirects to /methodology", async ({ page, request }) => {
    const res = await request.get("/about", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toMatch(/\/methodology$/);

    await page.goto("/about");
    await expect(page).toHaveURL(/\/methodology$/);
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
  });
});
