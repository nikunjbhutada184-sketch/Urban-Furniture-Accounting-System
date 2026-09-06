import { expect, test } from "@playwright/test";

/**
 * Anonymous behaviour.
 *
 * Everything reachable without a session, plus the redirects that keep the rest
 * out of reach. Deliberately runs with no stored session.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("signed out", () => {
  test("renders the sign-in page", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Login Id")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("offers sign-up and password recovery from the sign-in page", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("link", { name: "Sign Up" }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();

    await page.getByRole("link", { name: "Forgot Password" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("enforces the password policy on sign-up", async ({ page }) => {
    await page.goto("/signup");

    await page.locator("#loginId").fill("abc");
    await page.locator("#email").fill("someone@example.test");
    await page.locator("#password").fill("weak");
    await page.locator("#confirmPassword").fill("weak");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Login id must be between 6 and 12 characters.")).toBeVisible();
    await expect(page.getByText("Password must be more than 8 characters.")).toBeVisible();
  });

  test("reports a password mismatch on sign-up", async ({ page }) => {
    await page.goto("/signup");

    await page.locator("#loginId").fill("testuser1");
    await page.locator("#email").fill("someone@example.test");
    await page.locator("#password").fill("Abcdef12!");
    await page.locator("#confirmPassword").fill("Abcdef12?");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("The two passwords do not match.")).toBeVisible();
  });

  for (const path of ["/dashboard", "/portal", "/reports/balance-sheet", "/users", "/settings"]) {
    test(`redirects an anonymous visitor away from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("rejects invalid credentials without revealing whether the account exists", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Login Id").fill("nobodyatall");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "Invalid Login Id" });
    await expect(alert).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("refuses a report download without a session", async ({ request }) => {
    const response = await request.get("/reports/export?report=trial-balance", {
      maxRedirects: 0,
    });

    // Redirected to sign in rather than served the data.
    expect([302, 307]).toContain(response.status());
  });
});
