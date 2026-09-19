import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets a second checkout (an agent worktree) run the suite beside the
// main one; everything else uses 3000.
const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Every spec boots DuckDB-WASM + deck.gl under headless (software) WebGL and
  // is CPU-bound; parallel browsers starve the scenario queries and time out.
  // Serial is 17 green in ~3 min; two workers is flaky.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI runs a production build ahead of the suite (see .github/workflows/ci.yml)
    // and serves it with `next start`; locally we keep hot-reloading `next dev`.
    command: process.env.CI ? `pnpm start -p ${PORT}` : `pnpm dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
