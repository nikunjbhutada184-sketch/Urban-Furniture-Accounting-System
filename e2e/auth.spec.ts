import { expect, test } from "@playwright/test";

/**
 * Authentication smoke tests.
 *
 * These run against the app with no database seeded, so they cover the parts
 * that do not need data: the login page renders, protected routes redirect,
 * and bad credentials are rejected without leaking whether the account exists.
 * Role-based journeys arrive with the screens they exercise (Phase 3 onwards).
 */

test.describe("authentication", () => {
  test("renders the sign-in page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("redirects an anonymous visitor from the dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveURL(/callbackUrl=%2Fdashboard/);
  });

  test("redirects an anonymous visitor from the portal to login", async ({ page }) => {
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects an anonymous visitor from reports to login", async ({ page }) => {
    await page.goto("/reports/balance-sheet");
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects invalid credentials without revealing whether the account exists", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("nobody@urbanfurniture.test");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("Invalid email or password.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("validates the email format before attempting a sign-in", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("something");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });
});
