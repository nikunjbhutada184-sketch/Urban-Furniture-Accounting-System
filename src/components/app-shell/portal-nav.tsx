"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type NavItem } from "@/components/app-shell/nav-items";
import { cn } from "@/lib/utils";

/**
 * Portal navigation: a single row of tabs under the header.
 *
 * A portal user has three destinations, so a sidebar would be overkill — and a
 * row of tabs works at every width without a drawer.
 */
export function PortalNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <nav aria-label="Portal" className="border-b px-4 lg:px-6">
      <ul className="scroll-slim -mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          // "/portal" would otherwise light up on every child route.
          const isActive =
            item.href === "/portal" ? pathname === "/portal" : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
