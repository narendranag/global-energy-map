import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Every spec boots DuckDB-WASM + deck.gl under headless (software) WebGL and
  // is CPU-bound; parallel browsers starve the scenario queries and time out.
  // Serial is 17 green in ~3 min; two workers is flaky.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI runs a production build ahead of the suite (see .github/workflows/ci.yml)
    // and serves it with `next start`; locally we keep hot-reloading `next dev`.
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
