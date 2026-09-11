// scripts/smoke/playwright.config.ts — one browser check against a *deployed*
// URL (Phase 10, O3). No webServer: the target is SMOKE_URL.
//
//   SMOKE_URL=https://energymap.marain.space \
//     pnpm exec playwright test -c scripts/smoke/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.SMOKE_URL;
if (!baseURL) throw new Error("SMOKE_URL is required (the deployment to smoke-test)");

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  // One retry: a fresh deployment's first cold hit can be slow at the edge.
  retries: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  outputDir: "../../test-results/smoke",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
