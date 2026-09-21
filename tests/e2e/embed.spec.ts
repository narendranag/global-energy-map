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

  /**
   * A6 was reported as an embed FOUC: the chrome painting for a frame because
   * `useSearchParams()` is empty in the static prerender. It does not happen —
   * the `<Suspense>` boundary around the map makes Next emit
   * BAILOUT_TO_CLIENT_SIDE_RENDERING for `/`, so the served HTML carries no
   * chrome to paint and the first client render already knows `embed=1`. This
   * guards that property, because it is a side effect of the Suspense
   * boundary rather than something anyone wrote down: it watches every DOM
   * mutation and every animation frame from `readystatechange` on, and fails
   * if the header or intro card is ever in the document.
   */
  test("the chrome never enters the DOM, not even for one frame", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __chromeSeen: number }).__chromeSeen = 0;
      const check = () => {
        if (document.querySelector("header") ?? document.querySelector('[data-testid="intro-card"]')) {
          (window as unknown as { __chromeSeen: number }).__chromeSeen += 1;
        }
      };
      document.addEventListener("readystatechange", () => {
        new MutationObserver(check).observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
        check();
      });
      const raf = () => {
        check();
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    });
    await gotoReady(page, "/?embed=1&layers=reserves&year=2020");
    expect(
      await page.evaluate(() => (window as unknown as { __chromeSeen: number }).__chromeSeen),
    ).toBe(0);
  });

  test("the commodity toggle still works in plain embed mode", async ({ page }) => {
    await gotoReady(page, "/?embed=1");
    await expect(page.getByRole("button", { name: "Oil" })).toBeVisible();
  });

  test("&controls=0 hides the commodity toggle", async ({ page }) => {
    await gotoReady(page, "/?embed=1&controls=0");
    await expect(page.getByRole("button", { name: "Oil" })).toHaveCount(0);
  });

  test("the Layers panel collapses to a small Legend toggle", async ({ page }) => {
    await gotoReady(page, "/?embed=1");
    const toggle = page.getByRole("button", { name: /^Legend$/ });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Not `getByText`: "Reserves (country)" also labels a <dt> in the (still
    // collapsed) Data vintage list, so an unscoped text locator is ambiguous.
    // The checkbox is the unique, semantically right target.
    await expect(page.getByRole("checkbox", { name: "Reserves (country)" })).toBeVisible();
  });

  test("the scenario panel collapses to a one-line chip naming the scenario, both data years and the commodity", async ({
    page,
  }) => {
    await gotoReady(page, "/?embed=1&scenario=hormuz&commodity=oil&year=2022");
    // An embed's one line is all a reader has, and the number it labels is
    // trade x route share — so it names the route shares' vintage too.
    const chip = page.getByRole("button", {
      name: /Hormuz.*2022 trade, 2026 route shares.*oil/i,
    });
    await expect(chip).toBeVisible();
    await expect(page.getByTestId("scenario-slot")).toBeHidden();
    await chip.click();
    await expect(page.getByTestId("scenario-slot")).toBeVisible();
    await expect(page.getByTestId("ranked-importers")).toBeVisible();
  });

  test('"Open full map" points at the same state without embed, target=_blank', async ({
    page,
    baseURL,
  }) => {
    await gotoReady(page, "/?embed=1&year=2015&commodity=gas");
    const link = page.getByRole("link", { name: /Open full map/ });
    await expect(link).toBeVisible();
    // The href is only correct once the client has mounted (see
    // EmbedAttributionBar: it renders "/" during SSR to avoid a hydration
    // mismatch, then swaps in the real URL) — poll rather than reading it once.
    await expect(async () => {
      const href = await link.getAttribute("href");
      expect(href).not.toBe("/");
    }).toPass();
    const href = await link.getAttribute("href");
    expect(href).not.toBeNull();
    const url = new URL(href ?? "", baseURL);
    expect(url.searchParams.has("embed")).toBe(false);
    expect(url.searchParams.has("controls")).toBe(false);
    expect(url.searchParams.get("year")).toBe("2015");
    expect(url.searchParams.get("commodity")).toBe("gas");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("embed=1 survives a year change (the store's debounced URL rewrite)", async ({ page }) => {
    // "View latest" on the "as of" chip is the only thing that sets the year
    // now; it must not drop the embed flag from the rewritten querystring.
    await gotoReady(page, "/?embed=1&year=2018");
    await page.getByTestId("as-of-view-latest").click();
    await expect(page).toHaveURL(/year=2024/);
    await expect(page).toHaveURL(/embed=1/);
    await expect(page.getByTestId("as-of-chip")).toHaveCount(0);
  });

  test("a page that iframes the app renders the embed inside it", async ({ page, baseURL }) => {
    // Not `page.goto("about:blank")`: a relative `src` on an <iframe> written
    // into an about:blank document has no base URL to resolve against, so the
    // frame never actually navigates to the app — it stays about:blank and
    // nothing inside it ever appears. Loading the app's own origin first,
    // then writing the iframe with `setContent` (which keeps the current URL,
    // only replacing the document), gives the relative `src` a real base.
    await page.goto(baseURL ?? "/");
    await page.setContent(
      '<iframe src="/?embed=1" title="Global Energy Map" style="width:800px;height:600px;border:0"></iframe>',
    );
    const frame = page.frameLocator("iframe");
    // The e2e-wide readiness signal (see helpers.ts) rather than the canvas
    // directly: it is the same thing the rest of the suite trusts, and it
    // also proves the frame hydrated, not just that a <canvas> tag exists.
    await expect(frame.locator('main[data-ready="true"]')).toBeAttached({ timeout: 120_000 });
    await expect(frame.locator(".maplibregl-canvas")).toBeVisible({ timeout: 120_000 });
    await expect(frame.getByTestId("embed-attribution")).toBeVisible();
  });
});
