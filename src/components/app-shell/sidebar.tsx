"use client";

import * as Icons from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { type NavSection } from "./nav-items";

function Icon({ name, className }: { name: string; className?: string }) {
  const Component = (
    Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>
  )[name];
  return Component ? <Component className={className} /> : null;
}

/**
 * Primary navigation.
 *
 * Receives only the sections the current role may see -- filtered on the
 * server, so an unauthorised link is never sent to the browser.
 */
export function Sidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="scroll-slim flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-6"
    >
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="text-muted-foreground/70 mb-1 px-3 text-[10px] font-semibold tracking-[0.08em] uppercase">
            {section.title}
          </h2>

          <ul className="space-y-px">
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-full py-2 pr-3 pl-3 text-[13px] transition-colors",
                      isActive
                        ? "bg-primary-soft text-sidebar-accent-foreground font-semibold"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn(
                        "size-[18px] shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground/80",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.comingSoon ? (
                      <span className="bg-secondary text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium">
                        Soon
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
