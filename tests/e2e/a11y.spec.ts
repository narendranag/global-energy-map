// tests/e2e/a11y.spec.ts — accessibility (Phase 9.8 / D12): axe scans, names,
// focus order and rings, live regions, worst-case panel text contrast.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { SPEC_TIMEOUT, clickUntil, expect, gotoReady, test } from "./helpers";

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
      await gotoReady(page, "/?layers=reserves");
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
  await expect(boxes).toHaveCount(10);
  await expect(page.getByRole("checkbox", { name: "on", exact: true, includeHidden: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Refineries", includeHidden: true })).toHaveCount(1);

  await expect(page.getByRole("combobox", { name: "Scenario" })).toBeVisible();
  await expect(page.getByRole("slider", { name: /^Year/ })).toBeVisible();
  for (const name of ["Previous year", "Next year", "Play through years"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
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
  const slider = at((k) => k.startsWith("input:Year"));
  const map = at((k) => k === "map");

  const order = { share, dataLink, layers, picker, gas, slider, map };
  for (const [name, idx] of Object.entries(order)) expect(idx, `${name} in ${seen.join(" | ")}`).toBeGreaterThanOrEqual(0);
  expect(share).toBeLessThan(dataLink);
  expect(dataLink).toBeLessThan(layers); // header before panels
  expect(layers).toBeLessThan(picker); // left panel, then the scenario panel
  expect(picker).toBeLessThan(gas); // then the bottom controls
  expect(gas).toBeLessThan(slider);
  expect(slider).toBeLessThan(map); // map last
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

  test("Infrastructure: layers, legend (with a zoom-gated row), year, intro card", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves,pipelines,refineries,storage&year=2023");
    await expect(page.getByTestId("intro-card")).toBeVisible();
    await expect(page.getByTestId("year-note")).toBeVisible();
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
});
