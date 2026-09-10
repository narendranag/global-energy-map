// tests/e2e/modes.spec.ts — Infrastructure / Flows / Scenarios: presets, URL `mode`,
// old URLs, and the first-run intro card.
import type { Page } from "@playwright/test";
import {
  SPEC_TIMEOUT,
  INTRO_DISMISSED_KEY,
  clickUntil,
  expect,
  gotoReady,
  openLayers,
  scenarioSelect,
  test,
  waitForReady,
} from "./helpers";

test.setTimeout(SPEC_TIMEOUT);

const ALL_LAYERS = [
  "reserves",
  "basins",
  "extraction",
  "pipelines",
  "refineries",
  "storage",
  "ports",
  "gas_pipelines",
  "lng_terminals",
  "lng_voyages",
] as const;

/** Layer panel label per URL key. */
const LABEL: Record<(typeof ALL_LAYERS)[number], string> = {
  reserves: "Reserves (country)",
  basins: "Basins",
  extraction: "Extraction sites",
  pipelines: "Oil pipelines",
  refineries: "Refineries",
  storage: "Storage hubs",
  ports: "Ports",
  gas_pipelines: "Gas pipelines",
  lng_terminals: "LNG terminals",
  lng_voyages: "LNG voyages (2020–2024)",
};

/** Assert exactly `on` are ticked in the panel (every other layer unticked). */
async function expectLayers(page: Page, on: readonly (typeof ALL_LAYERS)[number][]) {
  for (const key of ALL_LAYERS) {
    const box = page.getByLabel(LABEL[key], { exact: true });
    if (on.includes(key)) await expect(box, key).toBeChecked();
    else await expect(box, key).not.toBeChecked();
  }
}

function param(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

async function selectTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name });
  await clickUntil(tab, async () => {
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 2_000 });
  });
}

test.describe("Modes", () => {
  test("tabs apply their presets and write `mode` to the URL", async ({ page }) => {
    await gotoReady(page, "/?layers=reserves&year=2021");

    // Flows: gas, LNG layers incl. voyages; 2021 is inside 2020–2024 so it stays.
    await selectTab(page, "Flows");
    await expect(page.locator("main")).toHaveAttribute("data-mode", "flows");
    await expect(page.getByRole("button", { name: "Gas" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('input[type="range"]')).toHaveValue("2021");
    await expect(page).toHaveURL(/mode=flows/);
    expect(param(page, "layers")).toBe("gas_pipelines,lng_terminals,lng_voyages");
    await expect(page.getByRole("button", { name: /^Layers\s*3 on$/ })).toHaveAttribute("aria-expanded", "false");
    await openLayers(page);
    await expectLayers(page, ["gas_pipelines", "lng_terminals", "lng_voyages"]);
    await waitForReady(page);

    // Scenarios: the picker appears and takes focus; reserves carries the ramp.
    await selectTab(page, "Scenarios");
    await expect(page.locator("main")).toHaveAttribute("data-mode", "scenarios");
    await expect(scenarioSelect(page)).toBeFocused();
    await expect(scenarioSelect(page)).toHaveValue("");
    await expect(page).toHaveURL(/mode=scenarios/);
    await expect.poll(() => param(page, "layers")).toBe("reserves,pipelines,refineries,lng_terminals");

    // Infrastructure: the five defaults, the Layers list open, no picker.
    await selectTab(page, "Infrastructure");
    await expect(page.locator("main")).toHaveAttribute("data-mode", "infrastructure");
    await expect(scenarioSelect(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Layers\s*5 on$/ })).toHaveAttribute("aria-expanded", "true");
    await expectLayers(page, ["reserves", "pipelines", "refineries", "gas_pipelines", "lng_terminals"]);
    await expect(page).toHaveURL(/mode=infrastructure/);
  });

  test("arrow keys move between tabs and select them", async ({ page }) => {
    await gotoReady(page, "/?layers=");
    const infra = page.getByRole("tab", { name: "Infrastructure" });
    await infra.focus();
    await page.keyboard.press("ArrowRight");
    const flows = page.getByRole("tab", { name: "Flows" });
    await expect(flows).toHaveAttribute("aria-selected", "true");
    await expect(flows).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Scenarios" })).toBeFocused();
    await expect(page.locator("main")).toHaveAttribute("data-mode", "scenarios");
    // Roving tabindex: only the selected tab is in the tab sequence.
    await expect(infra).toHaveAttribute("tabindex", "-1");
  });

  test("a URL `mode` applies its preset; explicit params still win", async ({ page }) => {
    await gotoReady(page, "/?mode=flows");
    await expect(page.getByRole("tab", { name: "Flows" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Gas" })).toHaveAttribute("aria-pressed", "true");
    await expectLayers(page, ["gas_pipelines", "lng_terminals", "lng_voyages"]);

    await gotoReady(page, "/?mode=flows&year=2015&commodity=oil&layers=reserves");
    await expect(page.getByRole("tab", { name: "Flows" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('input[type="range"]')).toHaveValue("2015");
    await expect(page.getByRole("button", { name: "Oil" })).toHaveAttribute("aria-pressed", "true");
    await expectLayers(page, ["reserves"]);
  });

  test("an old URL without `mode` shows exactly its layers", async ({ page }) => {
    await gotoReady(page, "/?layers=basins,ports&year=2010&commodity=oil");
    await expect(page.locator("main")).toHaveAttribute("data-mode", "infrastructure");
    await expect(page.getByRole("tab", { name: "Infrastructure" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: /^Layers\s*2 on$/ })).toBeVisible();
    await expectLayers(page, ["basins", "ports"]);
    await expect(page.locator('input[type="range"]')).toHaveValue("2010");
    // Nothing rewrote the shared layer set.
    await expect.poll(() => param(page, "layers")).toBe("basins,ports");
  });
});

test.describe("First-run intro card", () => {
  test.use({ showIntro: true });

  test("shows on a first visit; Escape dismisses it for good", async ({ page }) => {
    await gotoReady(page, "/?layers=");
    const card = page.getByTestId("intro-card");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: "What this map can answer" })).toBeVisible();

    await expect(async () => {
      await card.getByRole("button", { name: "Got it" }).focus();
      await page.keyboard.press("Escape");
      await expect(card).toHaveCount(0, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    // Focus is handed to the selected mode tab, not dropped on <body>.
    await expect(page.getByRole("tab", { name: "Infrastructure" })).toBeFocused();
    expect(await page.evaluate((k) => window.localStorage.getItem(k), INTRO_DISMISSED_KEY)).toBe("1");

    await page.reload();
    await waitForReady(page);
    await expect(page.getByTestId("intro-card")).toHaveCount(0);
  });

  test("an example question sets the whole view", async ({ page }) => {
    await gotoReady(page, "/?layers=");
    const card = page.getByTestId("intro-card");
    await clickUntil(card.getByTestId("example-qatar-lng-2023"), async () => {
      await expect(card).toHaveCount(0, { timeout: 2_000 });
    });
    await expect(page.locator("main")).toHaveAttribute("data-mode", "flows");
    await expect(page.locator('input[type="range"]')).toHaveValue("2023");
    await expect(page.getByRole("button", { name: "Gas" })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/mode=flows/);
    await waitForReady(page);
  });
});
