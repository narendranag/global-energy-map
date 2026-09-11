// tests/e2e/errors.spec.ts — runtime error reporting (Phase 10, O2): an
// uncaught error or unhandled rejection raises a friendly panel (reload /
// report / dismiss) instead of leaving a blank or silently broken map.
import AxeBuilder from "@axe-core/playwright";
import { SPEC_TIMEOUT, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

test.describe("Runtime error panel", () => {
  test("an uncaught error shows the panel with reload, a pre-filled report link and dismiss", async ({
    page,
  }) => {
    await page.goto("/methodology");
    const panel = page.getByTestId("app-error");
    // The listener mounts on hydration; an error thrown before that is not
    // seen, so throw until the panel appears.
    await expect(async () => {
      await page.evaluate(() => {
        setTimeout(() => {
          throw new Error("e2e synthetic uncaught error");
        }, 0);
      });
      await expect(panel).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    await expect(panel).toHaveAttribute("data-error-source", "error");
    await expect(panel).toContainText("Something went wrong loading this page");
    await expect(panel.getByRole("button", { name: "Reload" })).toBeVisible();

    const report = panel.getByRole("link", { name: "Report this problem" });
    const href = (await report.getAttribute("href")) ?? "";
    expect(href).toMatch(/^https:\/\/github\.com\/narendranag\/global-energy-map\/issues\/new\?title=/);
    expect(decodeURIComponent(href)).toContain("e2e synthetic uncaught error");

    const { violations } = await new AxeBuilder({ page }).include("[data-testid=app-error]").analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

    await panel.getByRole("button", { name: "Dismiss" }).click();
    await expect(panel).toBeHidden();
  });

  test("an unhandled rejection on the map raises the panel over the map", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves");
    const panel = page.getByTestId("app-error");
    await expect(panel).toHaveCount(0);

    await page.evaluate(() => {
      void Promise.reject(new Error("e2e synthetic rejection"));
    });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-error-source", "unhandledrejection");
    await expect(panel).toContainText("Something went wrong loading the map");
    // The page is still there underneath (overlay, not a replacement).
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  });

  test("benign noise (aborted fetch, ResizeObserver warning) does not raise the panel", async ({
    page,
  }) => {
    await gotoReady(page, "/?layers=reserves");
    await page.evaluate(async () => {
      const ctrl = new AbortController();
      const pending = fetch("/data/catalog.json", { signal: ctrl.signal });
      ctrl.abort();
      void pending; // rejected with AbortError, deliberately unhandled
      window.dispatchEvent(
        new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }),
      );
      await new Promise((r) => setTimeout(r, 250));
    });
    await expect(page.getByTestId("app-error")).toHaveCount(0);
  });
});
