import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
/**
 * Must be the same host as `AUTH_URL`.
 *
 * Auth.js redirects to `AUTH_URL` after a successful sign-in. Driving the app
 * on `127.0.0.1` while `AUTH_URL` says `localhost` crosses origins, and the
 * browser drops the session cookie on the way — every authenticated test then
 * lands back on the login page.
 */
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Which browser to drive.
 *
 * Playwright's own Chromium is the default and what CI should use. Set
 * `E2E_CHANNEL=chrome` to drive a locally installed Chrome instead, for
 * machines where the bundled download is blocked.
 */
const channel = process.env.E2E_CHANNEL;
const browser = { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  /**
   * Generous, because these run against `next dev`.
   *
   * Turbopack compiles each route the first time it is requested, and with
   * several workers racing on a database that now holds a few hundred rows per
   * screen, a first hit can take far longer than the 30s default. A production
   * build would not; this is the cost of testing the dev server.
   */
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Signs in once and saves a session for each role; everything else reuses it.
    { name: "setup", testMatch: /.*\.setup\.ts/, use: browser },
    {
      name: "anonymous",
      testMatch: /auth\.spec\.ts/,
      use: browser,
    },
    {
      name: "back-office",
      testMatch: /back-office\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...browser, storageState: "e2e/.auth/admin.json" },
    },
    {
      name: "portal",
      testMatch: /portal\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...browser, storageState: "e2e/.auth/portal.json" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
