// tests/e2e/helpers.ts — shared e2e plumbing: navigation + ready signal,
// hydration-safe interactions, console-error capture, and a canvas probe.
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { DEFAULT_VIEW, type MapView } from "../../src/lib/state/view";

export { expect };

/** localStorage key the first-run intro card writes when dismissed (IntroCard.tsx). */
export const INTRO_DISMISSED_KEY = "gem.intro.dismissed.v1";

/**
 * `test` with the first-run intro card pre-dismissed: it floats over the map
 * centre and would sit under pixel probes and hovers. A spec that exercises
 * the card opts back in with `test.use({ showIntro: true })`.
 */
export const test = base.extend<{ showIntro: boolean }>({
  showIntro: [false, { option: true }],
  page: async ({ page, showIntro }, provide) => {
    if (!showIntro) {
      await page.addInitScript((key) => {
        try {
          window.localStorage.setItem(key, "1");
        } catch {
          // storage blocked: the card shows; specs that care assert on it
        }
      }, INTRO_DISMISSED_KEY);
    }
    await provide(page);
  },
});

/**
 * Every spec boots DuckDB-WASM + deck.gl under headless software WebGL and is
 * CPU-bound; ubuntu-latest needs ~120 s for the slowest waits (CLAUDE.md).
 */
export const SPEC_TIMEOUT = 180_000;
export const READY_TIMEOUT = 120_000;

// ---------------------------------------------------------------------------
// Navigation + ready signal
// ---------------------------------------------------------------------------

/**
 * Wait until the map is mounted and `<main data-ready="true">` — every visible
 * layer (and the active scenario) has data for the current inputs.
 *
 * The MapLibre canvas is created in MapShell's mount effect, so its presence
 * also proves the page has hydrated: controls are live after this returns.
 */
export async function waitForReady(page: Page, timeout = READY_TIMEOUT): Promise<void> {
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout });
  await expect(page.locator("main")).toHaveAttribute("data-ready", "true", { timeout });
}

/** `page.goto(url)` then {@link waitForReady}. */
export async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForReady(page);
}

// ---------------------------------------------------------------------------
// Hydration-safe interactions
// ---------------------------------------------------------------------------

/**
 * Click `target` until `settled` passes. A click that lands before React has
 * hydrated is dropped, so retry — but only via `settled`, which must be
 * idempotent (checks state; never toggles).
 */
export async function clickUntil(
  target: Locator,
  settled: () => Promise<void>,
  timeout = 30_000,
): Promise<void> {
  await expect(async () => {
    await target.click();
    await settled();
  }).toPass({ timeout });
}

/**
 * Drive a (controlled) checkbox to `checked`. Re-reads the state before every
 * attempt, so a slow re-render never turns a retry into a second toggle.
 */
export async function setChecked(
  box: Locator,
  checked: boolean,
  timeout = 30_000,
  settle = 2_000,
): Promise<void> {
  await expect(async () => {
    if ((await box.isChecked()) !== checked) await box.click();
    await expect(box).toBeChecked({ checked, timeout: settle });
  }).toPass({ timeout });
}

/**
 * Expand the Layers disclosure (open by default only in Infrastructure mode)
 * so its checkboxes can be clicked.
 */
export async function openLayers(page: Page, timeout = 30_000): Promise<void> {
  const toggle = page.getByRole("button", { name: /^Layers\s*\d+ on$/ });
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 2_000 });
  }).toPass({ timeout });
}

/** The scenario picker (rendered in Scenarios mode or while a scenario is active). */
export function scenarioSelect(page: Page): Locator {
  return page.getByRole("combobox", { name: "Scenario" });
}

/** Header link by name (the map footer repeats "Methodology"). */
export function headerLink(page: Page, name: string): Locator {
  return page.getByRole("navigation", { name: "Site" }).getByRole("link", { name, exact: true });
}

/** Press a `aria-pressed` toggle button (e.g. the Oil/Gas selector) until it reads pressed. */
export async function press(button: Locator, timeout = 30_000): Promise<void> {
  await expect(async () => {
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// Console errors
// ---------------------------------------------------------------------------

/**
 * Errors that indicate a real data/query/type failure. WebGL/shader warnings
 * are noisy and environment-dependent, so they are ignored.
 */
const FATAL_CONSOLE = /duckdb|SQL|TypeError|Binder/i;

/** Collect fatal console errors and page errors; assert `toEqual([])` at the end. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && FATAL_CONSOLE.test(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err.message);
    if (FATAL_CONSOLE.test(err.message)) errors.push(err.message);
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Canvas probe
// ---------------------------------------------------------------------------
//
// Reads back what is actually on screen. deck.gl draws into MapLibre's WebGL
// canvas (MapboxOverlay, interleaved) without `preserveDrawingBuffer`, so
// `canvas.toDataURL()` can come back blank; a Playwright screenshot reads the
// composited frame instead and needs nothing exposed in the app. The PNG is
// decoded with a 2D canvas inside the page (no PNG dependency in Node).
// Callers poll (`expect.poll`) because tiles and deck frames land after
// `data-ready`.

export interface Px {
  readonly x: number;
  readonly y: number;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Page-space box of the map canvas (it sits below the header, not under it). */
export async function mapBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  if (!box) throw new Error("map canvas not laid out");
  return box;
}

/**
 * Page position of lon/lat for a Web-Mercator view (MapLibre: 512 px tiles):
 * the view's centre is the centre of the map canvas.
 */
export async function project(
  page: Page,
  lon: number,
  lat: number,
  view: MapView = DEFAULT_VIEW,
): Promise<Px> {
  const box = await mapBox(page);
  const world = 512 * 2 ** view.zoom;
  const mx = (lng: number) => ((lng + 180) / 360) * world;
  const my = (la: number) => {
    const s = Math.sin((la * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world;
  };
  return {
    x: Math.round(box.x + box.width / 2 + mx(lon) - mx(view.lon)),
    y: Math.round(box.y + box.height / 2 + my(lat) - my(view.lat)),
  };
}

/** {@link project} for several points. */
export async function projectAll(
  page: Page,
  points: readonly { lon: number; lat: number }[],
  view: MapView = DEFAULT_VIEW,
): Promise<Px[]> {
  const out: Px[] = [];
  for (const p of points) out.push(await project(page, p.lon, p.lat, view));
  return out;
}

/** Rows of RGBA bytes for `clip`, decoded in-page from a viewport screenshot. */
async function screenshotRgba(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<number[]> {
  const png = await page.screenshot({ clip, type: "png", animations: "disabled" });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, img.width, img.height).data);
  }, png.toString("base64"));
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/**
 * Per-channel median of a (2r+1)² patch around each point — robust to a thin
 * basemap label or outline crossing the probe.
 */
export async function samplePixels(page: Page, points: readonly Px[], radius = 3): Promise<Rgb[]> {
  const side = 2 * radius + 1;
  const out: Rgb[] = [];
  for (const p of points) {
    const data = await screenshotRgba(page, {
      x: p.x - radius,
      y: p.y - radius,
      width: side,
      height: side,
    });
    const r: number[] = [];
    const g: number[] = [];
    const b: number[] = [];
    for (let i = 0; i + 3 < data.length; i += 4) {
      r.push(data[i] ?? 0);
      g.push(data[i + 1] ?? 0);
      b.push(data[i + 2] ?? 0);
    }
    out.push({ r: median(r), g: median(g), b: median(b) });
  }
  return out;
}

/** Count pixels in `clip` that read as the extraction-site burnt orange (#b85a14). */
export async function countRedPixels(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<number> {
  const data = await screenshotRgba(page, clip);
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (r > 140 && r - g > 70 && r - b > 70) n++;
  }
  return n;
}

/** Green cast of a pixel (the reserves ramp is olive-green; the basemap is neutral). */
export const greenness = (c: Rgb): number => c.g - Math.max(c.r, c.b);
/** Red cast of a pixel (the scenario exposure ramp is red). */
export const redness = (c: Rgb): number => c.r - Math.max(c.g, c.b);

/**
 * Probe points inside Saudi Arabia, clear of the coasts, Riyadh and the
 * country label (basemap labels draw above the data layers).
 */
export const SAUDI_POINTS = [
  { lon: 44.0, lat: 21.5 },
  { lon: 48.5, lat: 21.0 },
  { lon: 46.5, lat: 19.5 },
] as const;

/** Median greenness across the Saudi probe points at `view`. */
export async function saudiGreenness(page: Page, view: MapView = DEFAULT_VIEW): Promise<number> {
  const px = await samplePixels(page, await projectAll(page, SAUDI_POINTS, view));
  return median(px.map(greenness));
}
