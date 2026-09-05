import { type Permission } from "@/server/auth/permissions";

/**
 * The four-column application menu.
 *
 * The sidebar groups screens by the part of the business they belong to; this
 * menu groups them the way the specification's dashboard does -- Sales,
 * Purchase, Account, Report -- so both ways of navigating reach the same
 * routes. Adding a screen here is a one-line change, and `permission` keeps it
 * out of a menu it does not belong in.
 *
 * Rendering is a convenience, never a boundary: every route behind these links
 * re-checks the same permission server-side.
 */

export interface MenuLink {
  label: string;
  href: string;
  permission: Permission;
}

export interface MenuColumn {
  title: string;
  links: MenuLink[];
}

export const APP_MENU: MenuColumn[] = [
  {
    title: "Sales",
    links: [
      { label: "Sales order", href: "/sales/orders", permission: "transaction:view" },
      { label: "Sale Invoice", href: "/sales/invoices", permission: "transaction:view" },
      { label: "Receipt", href: "/payments?direction=INBOUND", permission: "payment:view" },
    ],
  },
  {
    title: "Purchase",
    links: [
      { label: "Purchase Order", href: "/purchases/orders", permission: "transaction:view" },
      { label: "Purchase Bill", href: "/purchases/bills", permission: "transaction:view" },
      { label: "Payment", href: "/payments?direction=OUTBOUND", permission: "payment:view" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Contact", href: "/contacts", permission: "master:view" },
      { label: "Product", href: "/products", permission: "master:view" },
      { label: "Analyticals", href: "/analytic", permission: "master:view" },
      { label: "Analytical Budget", href: "/budgets", permission: "budget:view" },
      { label: "Chart of Account", href: "/accounts", permission: "master:view" },
      { label: "Journals", href: "/journals", permission: "master:view" },
      { label: "Journal Entries", href: "/journal-entries", permission: "transaction:view" },
    ],
  },
  {
    title: "Report",
    links: [
      { label: "Balancesheet", href: "/reports/balance-sheet", permission: "report:view" },
      { label: "Profit and Loss", href: "/reports/profit-and-loss", permission: "report:view" },
      { label: "Budget Report", href: "/reports/budget", permission: "budget:view" },
    ],
  },
];

/**
 * Drops every link the actor may not use, then every column left empty.
 *
 * Run on the server so the browser is never sent the shape of a menu the user
 * cannot open.
 */
export function visibleMenu(hasPermission: (permission: Permission) => boolean): MenuColumn[] {
  return APP_MENU.map((column) => ({
    title: column.title,
    links: column.links.filter((link) => hasPermission(link.permission)),
  })).filter((column) => column.links.length > 0);
}
