import { NAV_SECTIONS } from "@/components/app-shell/nav-items";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { auth } from "@/server/auth";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

/**
 * Back-office shell (ADMIN / ACCOUNTANT).
 *
 * A cool grey page, one large rounded shell floating on it, and the navigation
 * and content as surfaces inside that shell.
 *
 * The layout authorises on the server and filters navigation by permission, so
 * links a role cannot use never reach the browser -- ergonomics, not security:
 * every page and action authorises again.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePermissionOrRedirect("report:view");
  const session = await auth();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(actor, item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="bg-ground min-h-screen p-3 lg:p-5">
      <div className="shell mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1680px] gap-0 overflow-hidden rounded-3xl lg:min-h-[calc(100vh-2.5rem)]">
        <aside className="hidden w-[248px] shrink-0 flex-col lg:flex">
          <div className="flex h-[72px] items-center gap-2.5 px-5">
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full text-xs font-bold">
              UF
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Urban Furniture</span>
          </div>

          <Sidebar sections={sections} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            name={session?.user?.name ?? "User"}
            email={session?.user?.email ?? ""}
            role={actor.role}
            canManageSettings={can(actor, "settings:manage")}
          />

          <main className="bg-secondary/40 flex-1 overflow-x-hidden p-4 lg:rounded-tl-3xl lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
