import { defineConfig } from "@playwright/test";

const PORT = 3150;

export default defineConfig({
  testDir: "e2e",
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // CI downloads Chromium; locally, use the installed Chrome.
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  webServer: {
    // No credentials: the demo starts the fake Konnect in-process.
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DEMO_FAKE: "1" },
  },
});
