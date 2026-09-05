import { Bell, Search } from "lucide-react";
import { type UserRole } from "@prisma/client";
import { AppMenu } from "@/components/app-shell/app-menu";
import { type MenuColumn } from "@/components/app-shell/menu-model";
import { UserMenu } from "@/components/app-shell/user-menu";

/**
 * The top bar: a quiet strip carrying search, notifications and the user menu.
 *
 * Search is presentational for now -- every list has its own search box, and a
 * global search needs an index to be worth shipping.
 */
export function Topbar({
  menu,
  name,
  email,
  role,
  canManageSettings,
}: {
  menu: MenuColumn[];
  name: string;
  email: string;
  role: UserRole;
  canManageSettings: boolean;
}) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 px-4 lg:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-xs font-bold">
          UF
        </span>
        <span className="text-sm font-semibold">Urban Furniture</span>
      </div>

      <div className="hidden min-w-0 flex-1 lg:block">
        <AppMenu columns={menu} />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Search"
          className="bg-card text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-full transition-colors"
        >
          <Search className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          aria-label="Notifications"
          className="bg-card text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-full transition-colors"
        >
          <Bell className="size-4" aria-hidden />
        </button>

        <UserMenu name={name} email={email} role={role} canManageSettings={canManageSettings} />
      </div>
    </header>
  );
}
