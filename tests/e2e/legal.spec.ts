// tests/e2e/legal.spec.ts — terms and privacy pages, and provenance links
// (narendranag.com, marain.space) on the map and every content page.
import type { Locator } from "@playwright/test";
import { SPEC_TIMEOUT, expect, gotoReady, test } from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

async function expectProvenance(scope: Locator) {
  await expect(scope.locator('a[href="https://narendranag.com"]')).toHaveCount(1);
  await expect(scope.locator('a[href="https://marain.space"]')).toHaveCount(1);
  await expect(scope.locator('a[href="/terms"]')).toHaveCount(1);
  await expect(scope.locator('a[href="/privacy"]')).toHaveCount(1);
}

test.describe("Legal and provenance", () => {
  test("/terms renders from docs/legal/terms.md", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of use" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Not advice" })).toBeVisible();
    await expect(page.locator("main")).toContainText("Effective 11 September 2026");
    await expectProvenance(page.getByTestId("site-footer"));
  });

  test("/privacy renders from docs/legal/privacy.md", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
    await expect(page.locator("main")).toContainText("no cookies");
    await expect(page.locator('a[href="mailto:privacy.officer@marain.space"]').first()).toBeVisible();
    await expectProvenance(page.getByTestId("site-footer"));
  });

  test("methodology and data pages carry the provenance footer", async ({ page }) => {
    for (const path of ["/methodology", "/data"]) {
      await page.goto(path);
      await expectProvenance(page.getByTestId("site-footer"));
    }
  });

  test("the map footer credits the author and links the legal pages", async ({ page }) => {
    await gotoReady(page, "/?layers=");
    await expectProvenance(page.getByTestId("map-footer"));
  });
});
