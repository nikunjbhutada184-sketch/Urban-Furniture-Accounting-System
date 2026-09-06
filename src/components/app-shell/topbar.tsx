import { type UserRole } from "@prisma/client";
import { AppMenu } from "@/components/app-shell/app-menu";
import { type MenuColumn } from "@/components/app-shell/menu-model";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { type NavSection } from "@/components/app-shell/nav-items";
import { UserMenu } from "@/components/app-shell/user-menu";

/**
 * The top bar: the application menu and the user menu.
 *
 * It previously also carried a search button and a notification bell. Neither
 * did anything -- global search needs an index to be worth shipping, and there
 * is nothing generating notifications -- so they have been removed rather than
 * left as controls that ignore the click.
 */
export function Topbar({
  menu,
  sections,
  name,
  email,
  role,
  canManageSettings,
}: {
  menu: MenuColumn[];
  /** The sidebar's sections, for the narrow-screen drawer. */
  sections: NavSection[];
  name: string;
  email: string;
  role: UserRole;
  canManageSettings: boolean;
}) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 px-4 lg:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <MobileNav sections={sections} />
        <span className="text-sm font-semibold">Urban Furniture</span>
      </div>

      <div className="hidden min-w-0 flex-1 lg:block">
        <AppMenu columns={menu} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <UserMenu name={name} email={email} role={role} canManageSettings={canManageSettings} />
      </div>
    </header>
  );
}
