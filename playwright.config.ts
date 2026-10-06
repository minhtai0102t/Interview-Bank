import { defineConfig, devices } from "@playwright/test";

import { E2E_ORIGIN, E2E_SIGNED_IN_STATE } from "./tests/setup/e2e-env";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Every test opens its own browser page and starts a parsing worker. Firefox and WebKit starve each other
  // and the production server when many run at once, so the default of half the cores is too many here.
  workers: process.env.CI ? 2 : 4,
  // Reading the 300-question Word file alone takes several seconds in Firefox.
  timeout: 60_000,
  // The importer itself allows 15 seconds per file, and with four browsers running at once even a tiny file
  // has been seen to take over 10 seconds to appear in Firefox (4 to 5 seconds when run alone).
  expect: { timeout: 20_000 },
  forbidOnly: Boolean(process.env.CI),
  // Seen in Firefox driven by Playwright, about once in a few hundred runs: a worker created right after another
  // one was terminated never answers (its script context does not respond to evaluate for several seconds). The
  // same steps pass on the next attempt, and a test that needed one is reported as flaky rather than hidden.
  retries: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: E2E_ORIGIN,
    // Everyone starts out signed in as the same person; tests about signing in or out say otherwise.
    storageState: E2E_SIGNED_IN_STATE,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  // End-to-end tests always run against a fresh production build with its own throwaway database, never the
  // dev server. The script also writes the signed-in browser state used above before the server starts.
  webServer: {
    command: "pnpm e2e:server",
    url: `${E2E_ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
