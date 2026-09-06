import { test as setup, expect } from "@playwright/test";

/**
 * Signs in once and saves the session for the authenticated projects.
 *
 * Running this as its own project means the journey specs do not each pay for a
 * sign-in, and the credentials appear in exactly one place.
 *
 * These are the seed's development credentials, documented in the README. They
 * only exist in a local database; the seed refuses to run in production.
 */

const ADMIN_FILE = "e2e/.auth/admin.json";
const PORTAL_FILE = "e2e/.auth/portal.json";

const ADMIN_LOGIN_ID = process.env.E2E_ADMIN_LOGIN_ID ?? "ufowner";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe!123";
const PORTAL_LOGIN_ID = process.env.E2E_PORTAL_LOGIN_ID ?? "nimeshp";
const PORTAL_PASSWORD = process.env.E2E_PORTAL_PASSWORD ?? "ChangeMe!123";

setup("authenticate as administrator", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Login Id").fill(ADMIN_LOGIN_ID);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for the sign-in to land somewhere other than the login page, then
  // confirm the session really works by loading a protected screen.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

  await page.context().storageState({ path: ADMIN_FILE });
});

setup("authenticate as a portal user", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Login Id").fill(PORTAL_LOGIN_ID);
  await page.getByLabel("Password").fill(PORTAL_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/portal");
  await expect(page.getByRole("heading", { name: /Hello/ })).toBeVisible();

  await page.context().storageState({ path: PORTAL_FILE });
});
