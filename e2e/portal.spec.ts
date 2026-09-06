import { expect, test } from "@playwright/test";

/**
 * The customer portal.
 *
 * Two things matter: a customer can see and act on their own documents, and
 * they cannot reach anything else — including the whole back office.
 */

test.describe("portal", () => {
  test("lands on the customer's own overview", async ({ page }) => {
    await page.goto("/portal");

    await expect(page.getByRole("heading", { name: /Hello/ })).toBeVisible();
    await expect(page.getByText("Amount due")).toBeVisible();
  });

  test("navigates between the portal's own screens", async ({ page }) => {
    await page.goto("/portal");

    await page.getByRole("link", { name: "My Invoices" }).click();
    await expect(page).toHaveURL(/\/portal\/invoices/);
    await expect(page.getByRole("heading", { name: "My invoices", level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "My Payments" }).click();
    await expect(page).toHaveURL(/\/portal\/payments/);
    await expect(page.getByRole("heading", { name: "My payments", level: 1 })).toBeVisible();
  });

  const backOffice = [
    "/dashboard",
    "/contacts",
    "/sales/invoices",
    "/purchases/bills",
    "/payments",
    "/reports/balance-sheet",
    "/budgets",
    "/users",
    "/settings",
  ];

  for (const path of backOffice) {
    test(`keeps a portal user out of ${path}`, async ({ page }) => {
      await page.goto(path);
      // Bounced back to their own portal, never shown the back office.
      await expect(page).toHaveURL(/\/portal/);
    });
  }

  test("refuses a back-office report download", async ({ request }) => {
    const response = await request.get("/reports/export?report=customer-outstanding", {
      maxRedirects: 0,
    });

    // Either redirected away or refused outright -- never given the data.
    expect(response.status()).not.toBe(200);
  });

  test("404s on another customer's invoice id", async ({ page, request }) => {
    // A syntactically valid id that is not theirs.
    const response = await request.get("/portal/invoices/clzzzzzzzzzzzzzzzzzzzzzzz", {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(404);
    await page.goto("/portal/invoices");
    await expect(page.getByRole("heading", { name: "My invoices", level: 1 })).toBeVisible();
  });
});
