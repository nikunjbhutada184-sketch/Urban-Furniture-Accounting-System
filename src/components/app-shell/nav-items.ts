import { type Permission } from "@/server/auth/permissions";

/**
 * Navigation model.
 *
 * `permission` decides whether a link is *rendered*. It is a convenience for
 * the user, never a security boundary -- the page and every action behind it
 * re-check authorisation server-side.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission: Permission;
  /** Marks a screen that is planned but not yet built. */
  comingSoon?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "LayoutDashboard",
        permission: "report:view",
      },
    ],
  },
  {
    title: "Master Data",
    items: [
      { label: "Contacts", href: "/contacts", icon: "Users", permission: "master:view" },
      { label: "Products", href: "/products", icon: "Package", permission: "master:view" },
      {
        label: "Chart of Accounts",
        href: "/accounts",
        icon: "BookOpen",
        permission: "master:view",
      },
      { label: "Journals", href: "/journals", icon: "Library", permission: "master:view" },
      { label: "Analytic Accounts", href: "/analytic", icon: "Tags", permission: "master:view" },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        label: "Sales Orders",
        href: "/sales/orders",
        icon: "ClipboardList",
        permission: "transaction:view",
      },
      {
        label: "Customer Invoices",
        href: "/sales/invoices",
        icon: "FileText",
        permission: "transaction:view",
      },
      {
        label: "Customer Outstanding",
        href: "/reports/customer-outstanding",
        icon: "HandCoins",
        permission: "report:view",
      },
    ],
  },
  {
    title: "Purchases",
    items: [
      {
        label: "Purchase Orders",
        href: "/purchases/orders",
        icon: "ShoppingCart",
        permission: "transaction:view",
      },
      {
        label: "Vendor Bills",
        href: "/purchases/bills",
        icon: "ReceiptText",
        permission: "transaction:view",
      },
      {
        label: "Vendor Outstanding",
        href: "/reports/vendor-outstanding",
        icon: "Coins",
        permission: "report:view",
      },
    ],
  },
  {
    title: "Accounting",
    items: [
      { label: "Payments", href: "/payments", icon: "Wallet", permission: "payment:view" },
      {
        label: "Journal Entries",
        href: "/journal-entries",
        icon: "Scale",
        permission: "transaction:view",
      },
      {
        label: "General Ledger",
        href: "/general-ledger",
        icon: "BookMarked",
        permission: "report:view",
      },
      {
        label: "Trial Balance",
        href: "/reports/trial-balance",
        icon: "Scale3d",
        permission: "report:view",
      },
      {
        label: "Partner Ledger",
        href: "/reports/partner-ledger",
        icon: "BookUser",
        permission: "report:view",
      },
      { label: "Ageing", href: "/reports/ageing", icon: "Hourglass", permission: "report:view" },
    ],
  },
  {
    title: "Budget",
    items: [
      { label: "Budgets", href: "/budgets", icon: "Target", permission: "budget:view" },
      {
        label: "Budget Report",
        href: "/reports/budget",
        icon: "ChartColumn",
        permission: "budget:view",
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      { label: "Stock", href: "/inventory", icon: "Boxes", permission: "transaction:view" },
      {
        label: "Stock Report",
        href: "/reports/stock",
        icon: "PackageSearch",
        permission: "report:view",
      },
    ],
  },
  {
    title: "Reports",
    items: [
      {
        label: "Balance Sheet",
        href: "/reports/balance-sheet",
        icon: "Landmark",
        permission: "report:view",
      },
      {
        label: "Profit & Loss",
        href: "/reports/profit-and-loss",
        icon: "TrendingUp",
        permission: "report:view",
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Users",
        href: "/users",
        icon: "UserCog",
        permission: "user:manage",
      },
      {
        label: "Company Settings",
        href: "/settings",
        icon: "Settings",
        permission: "settings:manage",
      },
      { label: "Audit Log", href: "/settings/audit", icon: "ScrollText", permission: "audit:view" },
    ],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { label: "Overview", href: "/portal", icon: "LayoutDashboard", permission: "portal:view-own" },
  {
    label: "My Invoices",
    href: "/portal/invoices",
    icon: "FileText",
    permission: "portal:view-own",
  },
  { label: "My Payments", href: "/portal/payments", icon: "Wallet", permission: "portal:view-own" },
];
