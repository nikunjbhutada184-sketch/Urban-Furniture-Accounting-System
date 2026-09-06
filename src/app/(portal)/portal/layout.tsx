import { PORTAL_NAV } from "@/components/app-shell/nav-items";
import { PortalNav } from "@/components/app-shell/portal-nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { auth } from "@/server/auth";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

/**
 * Contact portal shell.
 *
 * A portal user reaches this only with the `portal:view-own` permission. Every
 * page beneath it additionally scopes its queries to the signed-in user's own
 * contact, so one contact can never load another's documents.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePermissionOrRedirect("portal:view-own");
  const session = await auth();

  // Filtered on the server, like the back-office sidebar: a link a portal user
  // cannot follow never reaches the browser.
  const nav = PORTAL_NAV.filter((item) => can(actor, item.permission));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b px-4 backdrop-blur lg:px-6">
        <div className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-xs font-bold">
            UF
          </span>
          <div className="leading-tight">
            <span className="block text-sm font-semibold">Urban Furniture</span>
            <span className="text-muted-foreground block text-[11px]">Customer portal</span>
          </div>
        </div>

        <UserMenu
          name={session?.user?.name ?? "User"}
          email={session?.user?.email ?? ""}
          role={actor.role}
          canManageSettings={false}
        />
      </header>

      <PortalNav items={nav} />

      <main className="flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
