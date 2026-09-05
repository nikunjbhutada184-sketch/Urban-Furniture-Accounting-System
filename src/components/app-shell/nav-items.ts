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
  /** Phase in TODO.md that delivers this screen; null once it is live. */
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
      {
        label: "Contacts",
        href: "/contacts",
        icon: "Users",
        permission: "master:view",
      },
      {
        label: "Products",
        href: "/products",
        icon: "Package",
        permission: "master:view",
      },
      {
        label: "Chart of Accounts",
        href: "/accounts",
        icon: "BookOpen",
        permission: "master:view",
      },
      {
        label: "Journals",
        href: "/journals",
        icon: "Library",
        permission: "master:view",
      },
      {
        label: "Analytic Accounts",
        href: "/analytic",
        icon: "Tags",
        permission: "master:view",
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
        href: "/sales/outstanding",
        icon: "Landmark",
        permission: "report:view",
      },
    ],
  },
  {
    title: "Accounting",
    items: [
      {
        label: "Payments",
        href: "/payments",
        icon: "Wallet",
        permission: "payment:view",
        comingSoon: true,
      },
      {
        label: "Journal Entries",
        href: "/journal-entries",
        icon: "Scale",
        permission: "transaction:view",
        comingSoon: true,
      },
      {
        label: "Budgets",
        href: "/budgets",
        icon: "Target",
        permission: "budget:view",
        comingSoon: true,
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
        comingSoon: true,
      },
      {
        label: "Profit & Loss",
        href: "/reports/profit-and-loss",
        icon: "TrendingUp",
        permission: "report:view",
        comingSoon: true,
      },
      {
        label: "Budget Report",
        href: "/reports/budget",
        icon: "ChartColumn",
        permission: "report:view",
        comingSoon: true,
      },
      {
        label: "Trial Balance",
        href: "/reports/trial-balance",
        icon: "Scale",
        permission: "report:view",
        comingSoon: true,
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
        comingSoon: true,
      },
      {
        label: "Company Settings",
        href: "/settings",
        icon: "Settings",
        permission: "settings:manage",
        comingSoon: true,
      },
    ],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { label: "My Documents", href: "/portal", icon: "FileText", permission: "portal:view-own" },
  {
    label: "Payments",
    href: "/portal/payments",
    icon: "Wallet",
    permission: "portal:pay-own",
    comingSoon: true,
  },
];
