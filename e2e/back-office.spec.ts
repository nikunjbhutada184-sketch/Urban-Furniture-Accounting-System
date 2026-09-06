import { expect, test } from "@playwright/test";

/**
 * The back-office journeys.
 *
 * These run with the administrator session saved by `auth.setup.ts`. They check
 * that each screen loads real data and that the things a user actually clicks —
 * navigation, view switches, downloads — work end to end.
 */

test.describe("navigation", () => {
  test("opens the four-column application menu", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Account" }).click();

    const panel = page.locator("#app-menu-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: "Chart of Account" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "Journal Entries" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("reaches the sidebar from a narrow screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    // The sidebar itself is hidden below `lg`; the drawer is the way in.
    await page.getByRole("button", { name: "Open navigation" }).click();

    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("link", { name: "Contacts" }).click();
    await expect(page).toHaveURL(/\/contacts/);
    // Navigating closes the drawer.
    await expect(drawer).toBeHidden();
  });
});

test.describe("dashboard", () => {
  test("shows quick-access cards backed by real counts", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

    // Scoped to the content area: the sidebar has its own "Sales" heading.
    const main = page.getByRole("main");

    for (const title of ["Sales", "Purchase", "Budget Reports"]) {
      await expect(main.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }

    // The tiles link to the lists they count.
    await main
      .getByRole("link", { name: /^Draft/ })
      .first()
      .click();
    await expect(page).toHaveURL(/status=DRAFT/);
  });
});

test.describe("reports", () => {
  const reports = [
    { path: "/reports/trial-balance", heading: "Trial Balance" },
    { path: "/reports/profit-and-loss", heading: "Profit & Loss" },
    { path: "/reports/balance-sheet", heading: "Balance Sheet" },
    { path: "/reports/budget", heading: "Budget Report" },
    { path: "/reports/stock", heading: "Stock Report" },
    { path: "/reports/customer-outstanding", heading: "Customer Outstanding" },
    { path: "/reports/vendor-outstanding", heading: "Vendor Outstanding" },
    { path: "/reports/ageing", heading: "Customer Ageing" },
    { path: "/reports/partner-ledger", heading: "Partner Ledger" },
    { path: "/general-ledger", heading: "General Ledger" },
  ];

  for (const report of reports) {
    test(`renders ${report.heading}`, async ({ page }) => {
      await page.goto(report.path);
      await expect(page.getByRole("heading", { name: report.heading, level: 1 })).toBeVisible();
    });
  }

  test("downloads the balance sheet as a PDF", async ({ page }) => {
    await page.goto("/reports/balance-sheet");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "PDF" }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^balance-sheet_.*\.pdf$/);
  });

  test("downloads the trial balance as a CSV", async ({ page }) => {
    await page.goto("/reports/trial-balance");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "CSV" }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^trial-balance_.*\.csv$/);
  });

  test("switches the ageing report between customers and vendors", async ({ page }) => {
    await page.goto("/reports/ageing");

    await page.getByRole("radio", { name: "Vendors" }).click();
    await expect(page.getByRole("heading", { name: "Vendor Ageing", level: 1 })).toBeVisible();
  });
});

test.describe("budgets", () => {
  test("switches between the list and the kanban", async ({ page }) => {
    await page.goto("/budgets");

    await expect(page.getByRole("columnheader", { name: "Pie Chart" })).toBeVisible();

    await page.getByRole("link", { name: "Kanban view" }).click();
    await expect(page).toHaveURL(/view=kanban/);
    // The donut is labelled, so identity never rests on colour alone.
    await expect(page.getByText("Achieved", { exact: true }).first()).toBeVisible();

    await page.getByRole("link", { name: "List view" }).click();
    await expect(page.getByRole("columnheader", { name: "Pie Chart" })).toBeVisible();
  });
});

test.describe("payments", () => {
  test("walks the standalone payment registration flow", async ({ page }) => {
    await page.goto("/payments");
    await page.getByRole("link", { name: "Register payment" }).click();

    await expect(page).toHaveURL(/\/payments\/new/);
    await expect(page.getByRole("radio", { name: /Receive/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Switching direction re-asks for the contact, because the two sides draw
    // from different lists.
    await page.getByRole("radio", { name: /Send/ }).click();
    await expect(page).toHaveURL(/direction=OUTBOUND/);
    await expect(page.getByText(/Choose the vendor you are paying/)).toBeVisible();
  });
});

test.describe("administration", () => {
  test("lists users with their login ids", async ({ page }) => {
    // Searched rather than scanned: the list is paged, so a specific login is
    // not necessarily on the first page once there are many users.
    await page.goto("/users?q=ufowner");

    await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
    await expect(page.getByRole("cell", { name: "ufowner" })).toBeVisible();
  });

  test("validates the create-user form server-side", async ({ page }) => {
    await page.goto("/users/new");

    await page.locator("#name").fill("Test Person");
    await page.locator("#loginId").fill("abc");
    await page.locator("#email").fill("test-person@example.test");
    await page.locator("#password").fill("weak");
    await page.locator("#confirmPassword").fill("weak");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Login id must be between 6 and 12 characters.")).toBeVisible();
    await expect(page.getByText("Password must be more than 8 characters.")).toBeVisible();
  });

  test("refuses a duplicate login id", async ({ page }) => {
    await page.goto("/users/new");

    await page.locator("#name").fill("Impostor");
    await page.locator("#loginId").fill("ufowner");
    await page.locator("#email").fill(`impostor-${Date.now()}@example.test`);
    await page.locator("#password").fill("Abcdef12!");
    await page.locator("#confirmPassword").fill("Abcdef12!");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(
      page.getByText("That login id is already taken. Choose another.").first(),
    ).toBeVisible();
  });

  test("opens company settings and the audit log", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Company Settings", level: 1 })).toBeVisible();

    // The sidebar also links to "Audit Log"; this is the button on the page.
    await page.getByRole("main").getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByRole("heading", { name: "Audit Log", level: 1 })).toBeVisible();
  });

  test("refuses to move the accounting lock date backwards", async ({ page }) => {
    await page.goto("/settings");

    // Set a lock date, then try to pull it back a year.
    await page.locator("#lockDate").fill("2026-03-31");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toContainText("Company settings saved.");

    await page.reload();
    await page.locator("#lockDate").fill("2025-03-31");
    await page.getByRole("button", { name: "Save settings" }).click();

    await expect(page.getByRole("alert").first()).toContainText("cannot be moved backwards");
  });
});

test.describe("master data", () => {
  const screens = [
    { path: "/contacts", heading: "Contacts" },
    { path: "/products", heading: "Products" },
    { path: "/accounts", heading: "Chart of Accounts" },
    { path: "/journals", heading: "Journals" },
    { path: "/analytic", heading: "Analytic Accounts" },
    { path: "/journal-entries", heading: "Journal Entries" },
    { path: "/inventory", heading: "Stock" },
  ];

  for (const screen of screens) {
    test(`renders ${screen.heading}`, async ({ page }) => {
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { name: screen.heading, level: 1 })).toBeVisible();
    });
  }
});
