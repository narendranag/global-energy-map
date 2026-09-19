// tests/e2e/embed.spec.ts — S7 embed mode (`?embed=1`, optional `&controls=0`):
// chrome removed, attribution kept, embed=1 survives a URL rewrite, and a
// page that iframes the app renders.
import { SPEC_TIMEOUT, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

test.describe("embed mode", () => {
  test("hides the header, intro card and phone banner; keeps the attribution bar", async ({ page }) => {
    await gotoReady(page, "/?embed=1");

    await expect(page.locator("header")).toHaveCount(0);
    await expect(page.getByTestId("intro-card")).toHaveCount(0);
    await expect(page.getByTestId("phone-banner")).toHaveCount(0);
    await expect(page.getByTestId("map-footer")).toHaveCount(0);

    const bar = page.getByTestId("embed-attribution");
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Global Energy Map");
    await expect(bar).toContainText("Global Energy Monitor");
    await expect(bar).toContainText("LNG-T3");
    await expect(bar).toContainText("NETL");
    await expect(bar).toContainText("Energy Institute");
    await expect(bar).toContainText("BACI");
    await expect(bar).toContainText("OpenStreetMap");

    // The MapLibre attribution control is unrelated to embed mode and stays.
    await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
  });

  test("the year slider and commodity toggle still work in plain embed mode", async ({ page }) => {
    await gotoReady(page, "/?embed=1");
    await expect(page.locator('input[type="range"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Oil" })).toBeVisible();
  });

  test("&controls=0 hides the slider and commodity toggle", async ({ page }) => {
    await gotoReady(page, "/?embed=1&controls=0");
    await expect(page.locator('input[type="range"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Oil" })).toHaveCount(0);
  });

  test("the Layers panel collapses to a small Legend toggle", async ({ page }) => {
    await gotoReady(page, "/?embed=1");
    const toggle = page.getByRole("button", { name: /^Legend$/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Reserves (country)")).toBeVisible();
  });

  test("the scenario panel collapses to a one-line chip naming the scenario, year and commodity", async ({
    page,
  }) => {
    await gotoReady(page, "/?embed=1&scenario=hormuz&commodity=oil&year=2022");
    const chip = page.getByRole("button", { name: /Hormuz.*2022.*oil/i });
    await expect(chip).toBeVisible();
    await expect(page.getByTestId("scenario-slot")).toBeHidden();
    await chip.click();
    await expect(page.getByTestId("scenario-slot")).toBeVisible();
    await expect(page.getByTestId("ranked-importers")).toBeVisible();
  });

  test('"Open full map" points at the same state without embed, target=_blank', async ({ page }) => {
    await gotoReady(page, "/?embed=1&year=2015&commodity=gas");
    const link = page.getByRole("link", { name: /Open full map/ });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).not.toBeNull();
    const url = new URL(href ?? "", "http://localhost:3000");
    expect(url.searchParams.has("embed")).toBe(false);
    expect(url.searchParams.has("controls")).toBe(false);
    expect(url.searchParams.get("year")).toBe("2015");
    expect(url.searchParams.get("commodity")).toBe("gas");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("embed=1 survives a year change (the store's debounced URL rewrite)", async ({ page }) => {
    await gotoReady(page, "/?embed=1");
    const slider = page.locator('input[type="range"]');
    await slider.fill("2018");
    await slider.dispatchEvent("change");
    await expect(page).toHaveURL(/year=2018/);
    await expect(page).toHaveURL(/embed=1/);
  });

  test("a page that iframes the app renders the embed inside it", async ({ page }) => {
    await page.goto("about:blank");
    await page.setContent(
      '<iframe src="/?embed=1" title="Global Energy Map" style="width:800px;height:600px;border:0"></iframe>',
    );
    const frame = page.frameLocator("iframe");
    await expect(frame.locator(".maplibregl-canvas")).toBeVisible({ timeout: 120_000 });
    await expect(frame.getByTestId("embed-attribution")).toBeVisible();
  });
});
