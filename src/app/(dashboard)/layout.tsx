import { NAV_SECTIONS } from "@/components/app-shell/nav-items";
import { Sidebar } from "@/components/app-shell/sidebar";
import { UserMenu } from "@/components/app-shell/user-menu";
import { auth } from "@/server/auth";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

/**
 * Back-office shell (ADMIN / ACCOUNTANT).
 *
 * The layout authorises on the server before rendering, and filters navigation
 * by permission so links the role cannot use are never sent to the browser.
 * That is ergonomics, not security: each page and action authorises again.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // A portal user has no "report:view" permission and is redirected to /portal.
  const actor = await requirePermissionOrRedirect("report:view");
  const session = await auth();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(actor, item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar hidden w-64 shrink-0 border-r lg:block">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-xs font-bold">
            UF
          </span>
          <span className="text-sm font-semibold tracking-tight">Urban Furniture</span>
        </div>
        <Sidebar sections={sections} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b px-4 backdrop-blur">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-xs font-bold">
              UF
            </span>
            <span className="text-sm font-semibold">Urban Furniture</span>
          </div>

          <div className="text-muted-foreground hidden text-sm lg:block">Accounting</div>

          <UserMenu
            name={session?.user?.name ?? "User"}
            email={session?.user?.email ?? ""}
            role={actor.role}
            canManageSettings={can(actor, "settings:manage")}
          />
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
