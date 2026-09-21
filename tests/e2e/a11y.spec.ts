// tests/e2e/a11y.spec.ts — accessibility (Phase 9.8 / D12): axe scans, names,
// focus order and rings, live regions, worst-case panel text contrast.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { SPEC_TIMEOUT, clickUntil, expect, gotoReady, test } from "./helpers";
import { LAYER_LABELS } from "../../src/lib/export/layers";

test.setTimeout(SPEC_TIMEOUT);

// ---------------------------------------------------------------------------
// axe
// ---------------------------------------------------------------------------

/**
 * Serious + critical axe violations, formatted one per node. Nothing is
 * excluded: the MapLibre canvas (role="region", labelled) and its attribution
 * control pass as they are.
 */
async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((n) => `${v.id} (${v.impact ?? ""}): ${n.target.join(" ")}`));
}

test.describe("axe: zero serious/critical violations", () => {
  test("/ (default view)", async ({ page }) => {
    await gotoReady(page, "/");
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("/ in Scenarios with a result and the Share panel open", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023");
    await expect(page.getByTestId("ranked-importers")).toBeVisible();
    await clickUntil(page.getByTestId("share-button"), async () => {
      await expect(page.getByTestId("share-panel")).toBeVisible({ timeout: 2_000 });
    });
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("/ with the country panel open beside a scenario", async ({ page }) => {
    await gotoReady(page, "/?focus=JPN&year=2024&scenario=hormuz&layers=reserves");
    // Wait for the panel's own sections: they load after `data-ready`, and an
    // axe run on a half-built panel proves nothing.
    await expect(page.getByTestId("country-suppliers")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("country-exposure-rows")).toBeVisible({ timeout: 60_000 });
    expect(await seriousViolations(page)).toEqual([]);
  });

  // The three pieces of UI the year slider's removal added: the visible
  // scenario headline, the "Data behind this result" disclosure and the
  // "as of" chip a pinned link shows.
  test("/ pinned to an older year, with a scenario and its vintage disclosure", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&year=2010&commodity=oil&layers=reserves");
    await expect(page.getByTestId("as-of-chip")).toBeVisible();
    await expect(page.getByTestId("scenario-announcement")).toBeVisible();
    const vintage = page.getByTestId("scenario-vintage");
    await expect(vintage).toBeVisible({ timeout: 60_000 });
    // It is open by default now, so axe already sees its contents; collapsing
    // and reopening checks the closed state too.
    await vintage.locator("summary").click();
    await vintage.locator("summary").click();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("/ in Scenarios with nothing picked (the empty state)", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&layers=reserves");
    await expect(page.getByTestId("scenario-empty")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("/methodology", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByRole("heading", { level: 1, name: "Methodology" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("/data", async ({ page }) => {
    await page.goto("/data");
    await expect(page.getByRole("heading", { level: 1, name: "Data" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("/query, before and after a result is on screen", async ({ page }) => {
    await page.goto("/query");
    await expect(page.getByRole("heading", { level: 1, name: "Query console" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // The result grid is the part most likely to fail: header cells, caption.
    await clickUntil(
      page.getByTestId("run-query"),
      async () => {
        await expect(page.getByTestId("query-results")).toBeVisible({ timeout: 20_000 });
      },
      120_000,
    );
    expect(await seriousViolations(page)).toEqual([]);
  });

  for (const [path, name] of [["/terms", "Terms of use"], ["/privacy", "Privacy"]] as const) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test.describe("with the intro card", () => {
    test.use({ showIntro: true });
    test("/ (first visit)", async ({ page }) => {
      // A bare / still shows the intro card (no explicit state params).
      await gotoReady(page, "/");
      await expect(page.getByTestId("intro-card")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Names, landmarks, live regions
// ---------------------------------------------------------------------------

test("controls have accessible names; the map region is labelled", async ({ page }) => {
  await gotoReady(page, "/?mode=scenarios&scenario=druzhba&year=2022&layers=reserves");

  // D12: every layer checkbox was named "on"; now each is named by its label.
  const boxes = page.getByRole("checkbox", { includeHidden: true });
  // Derived, not hard-coded: adding a layer should not fail this test, which
  // is about every checkbox having a real name, not about how many there are.
  await expect(boxes).toHaveCount(Object.keys(LAYER_LABELS).length);
  await expect(page.getByRole("checkbox", { name: "on", exact: true, includeHidden: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Refineries", includeHidden: true })).toHaveCount(1);

  await expect(page.getByRole("combobox", { name: "Scenario" })).toBeVisible();
  // The year slider and its transport buttons are gone; the only year
  // affordance left is the "as of" chip a pinned link shows.
  await expect(page.getByRole("slider", { name: /^Year/ })).toHaveCount(0);
  await expect(page.getByTestId("as-of-chip").getByRole("status")).toBeVisible();
  await expect(page.getByRole("button", { name: /^View latest/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "Commodity" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Mode" })).toBeVisible();

  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toHaveAttribute("role", "region");
  await expect(canvas).toHaveAttribute("aria-label", /^Map — arrow keys pan/);
  await expect(canvas).toHaveAttribute("tabindex", "0");

  // Live regions: the loading pill's container and a one-line scenario summary.
  await expect(page.locator("header [aria-live='polite']")).toHaveCount(1);
  await expect(page.getByTestId("scenario-announcement")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByTestId("scenario-announcement")).toContainText(/Druzhba.*2022/);
});

// ---------------------------------------------------------------------------
// Keyboard: focus order, focus rings, Escape
// ---------------------------------------------------------------------------

/** A short, stable description of the focused element. */
async function focusedKey(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    if (el.classList.contains("maplibregl-canvas")) return "map";
    const label =
      el.getAttribute("aria-label") ??
      (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null) ??
      el.textContent;
    return `${el.tagName.toLowerCase()}:${label.trim().replace(/\s+/g, " ").slice(0, 40)}`;
  });
}

test("focus order runs header → panels → map", async ({ page }) => {
  await gotoReady(page, "/?mode=scenarios&scenario=druzhba&year=2022&layers=reserves");
  await page.getByRole("tab", { name: "Scenarios" }).focus();

  const seen: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const key = await focusedKey(page);
    seen.push(key);
    if (key === "map") break;
  }
  const at = (pred: (k: string) => boolean) => seen.findIndex(pred);
  const share = at((k) => k.startsWith("button:Share / cite"));
  const dataLink = at((k) => k === "a:Data");
  const layers = at((k) => /^button:Layers\s*\d+ on/.test(k));
  const picker = at((k) => k.startsWith("select:"));
  const gas = at((k) => k === "button:Gas");
  // The year slider used to sit here; the "as of" chip's one button is what
  // the bottom-centre slot holds now (this link is pinned to 2022).
  const asOf = at((k) => k.startsWith("button:View latest"));
  const map = at((k) => k === "map");

  const order = { share, dataLink, layers, picker, gas, asOf, map };
  for (const [name, idx] of Object.entries(order)) expect(idx, `${name} in ${seen.join(" | ")}`).toBeGreaterThanOrEqual(0);
  expect(share).toBeLessThan(dataLink);
  expect(dataLink).toBeLessThan(layers); // header before panels
  expect(layers).toBeLessThan(picker); // left panel, then the scenario panel
  expect(picker).toBeLessThan(gas); // then the bottom controls
  expect(gas).toBeLessThan(asOf);
  expect(asOf).toBeLessThan(map); // map last
});

test("the country panel sits between the scenario panel and the bottom controls", async ({
  page,
}) => {
  await gotoReady(page, "/?mode=scenarios&scenario=druzhba&year=2022&layers=reserves&focus=DEU");
  await expect(page.getByTestId("country-suppliers")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Scenarios" }).focus();

  // A budget larger than the plain focus-order test's: the country panel adds
  // ~15 tabbable rows (suppliers, customers, exposure) of its own.
  const seen: string[] = [];
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press("Tab");
    const key = await focusedKey(page);
    seen.push(key);
    if (key === "map") break;
  }
  const at = (pred: (k: string) => boolean) => seen.findIndex(pred);
  const picker = at((k) => k.startsWith("select:"));
  const close = at((k) => k.startsWith("button:Close Germany"));
  const zoom = at((k) => k === "button:Zoom to");
  const gas = at((k) => k === "button:Gas");
  const map = at((k) => k === "map");

  for (const [name, idx] of Object.entries({ picker, close, zoom, gas, map })) {
    expect(idx, `${name} in ${seen.join(" | ")}`).toBeGreaterThanOrEqual(0);
  }
  expect(picker).toBeLessThan(close); // scenario panel, then the country panel
  expect(close).toBeLessThan(zoom); // its header first
  expect(zoom).toBeLessThan(gas); // then the bottom controls
  expect(gas).toBeLessThan(map); // map last
});

test("keyboard focus shows a visible ring (controls and the map)", async ({ page }) => {
  await gotoReady(page, "/?layers=reserves");
  const ring = (selector: string) =>
    page.locator(selector).first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
    });

  // Keyboard-focus the first layer checkbox (Tab from the Layers toggle).
  await page.getByRole("button", { name: /^Layers\s*\d+ on$/ }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Reserves (country)")).toBeFocused();
  expect(await ring("input:focus-visible")).toEqual({ style: "solid", width: 2 });

  // The map canvas: an inset ring, since its container clips overflow.
  await page.getByRole("link", { name: "Methodology", exact: true }).last().focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".maplibregl-canvas")).toBeFocused();
  expect(await ring(".maplibregl-canvas:focus-visible")).toEqual({ style: "solid", width: 2 });
});

test("Escape closes the Share panel and returns focus to its button", async ({ page }) => {
  await gotoReady(page, "/?layers=");
  const button = page.getByTestId("share-button");
  await button.focus();
  await expect(async () => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("share-panel")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  // Focus moved into the panel; Shift+Tab off its first control returns to the button.
  await expect(page.getByRole("textbox", { name: "URL of this view" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  await expect(page.getByTestId("share-panel")).toBeVisible();

  await page.getByRole("textbox", { name: "URL of this view" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("share-panel")).toHaveCount(0);
  await expect(button).toBeFocused();
});

// ---------------------------------------------------------------------------
// Contrast: panel text over the darkest possible map
// ---------------------------------------------------------------------------

/**
 * Every visible text run in the page chrome with contrast below WCAG AA
 * (4.5:1; 3:1 for large text). Map panels are translucent, so their
 * background is composited over **black** — darker than anything the map can
 * draw — which bounds the real contrast from below. Colours are resolved
 * through a 2D canvas, so oklch/lab/color-mix values compare correctly.
 */
async function lowContrastText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    const rgba = (c: string): number[] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    const over = (f: number[], b: number[]) =>
      [0, 1, 2].map((i) => (f[i] ?? 0) * (f[3] ?? 1) + (b[i] ?? 0) * (1 - (f[3] ?? 1)));
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
      return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
    };

    const mapArea = document.querySelector("main > div.relative");
    const failures: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("main *, [role='dialog'] *")) {
      if (el.closest(".maplibregl-map")) continue; // third-party map chrome, drawn over the basemap
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (!ownText || el.getClientRects().length === 0) continue;
      if (el.closest("button:disabled")) continue; // WCAG 1.4.3 exempts inactive controls
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;

      let opacity = 1;
      const layers: number[][] = [];
      let opaque = false;
      for (let a: HTMLElement | null = el; a && a !== mapArea; a = a.parentElement) {
        const s = getComputedStyle(a);
        opacity *= Number(s.opacity);
        const bg = rgba(s.backgroundColor);
        if (!opaque && (bg[3] ?? 0) > 0) {
          layers.push(bg);
          if ((bg[3] ?? 0) >= 1) opaque = true;
        }
      }
      let bg = [0, 0, 0]; // worst case: the map beneath is black
      for (const l of layers.reverse()) bg = over(l, bg);
      const fg = rgba(cs.color);
      const text = over([fg[0] ?? 0, fg[1] ?? 0, fg[2] ?? 0, (fg[3] ?? 1) * opacity], bg);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const c = ratio(text, bg);
      if (c < (large ? 3 : 4.5)) {
        failures.push(`${c.toFixed(2)}:1 "${el.textContent.trim().slice(0, 40)}" (${el.className})`);
      }
    }
    return failures;
  });
}

test.describe("text contrast ≥ 4.5:1 with panels over a black map", () => {
  test.use({ showIntro: true });

  test("Infrastructure: layers, legend (with a zoom-gated row), as-of chip, intro card", async ({ page }) => {
    // The intro card only shows on a URL with no explicit state, and the
    // "as of" chip only on one pinned to an older year, so two loads.
    await gotoReady(page, "/");
    await expect(page.getByTestId("intro-card")).toBeVisible();
    expect(await lowContrastText(page)).toEqual([]);

    await gotoReady(page, "/?layers=reserves,pipelines,refineries,storage&year=2023");
    await expect(page.getByTestId("intro-card")).toHaveCount(0);
    await expect(page.getByTestId("as-of-chip")).toBeVisible();
    expect(await lowContrastText(page)).toEqual([]);
  });

  test("Scenarios (gas): results, coverage badges, route shares, Share panel", async ({ page }) => {
    await gotoReady(page, "/?mode=scenarios&scenario=hormuz&commodity=gas&year=2023&layers=reserves,lng_terminals");
    await expect(page.getByTestId("ranked-assets")).toBeVisible();
    await clickUntil(page.getByTestId("share-button"), async () => {
      await expect(page.getByTestId("share-panel")).toBeVisible({ timeout: 2_000 });
    });
    expect(await lowContrastText(page)).toEqual([]);
  });

  test("the country panel: every section, source line and sparkline caption", async ({ page }) => {
    // Germany has all of them: EI reserves, BACI trade, exposure, assets, GIE
    // storage and a Comtrade window — the widest set of section text there is.
    await gotoReady(page, "/?focus=DEU&year=2022&commodity=gas&layers=reserves&scenario=hormuz");
    await expect(page.getByTestId("country-storage")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("country-suppliers")).toBeVisible();
    expect(await lowContrastText(page)).toEqual([]);
  });
});
