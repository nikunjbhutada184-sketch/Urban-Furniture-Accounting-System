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
 * Primary navigation. Receives only the sections the current role is allowed
 * to see -- the filtering happens on the server, so an unauthorised link is
 * never sent to the browser in the first place.
 */
export function Sidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="text-muted-foreground mb-2 px-2 text-[11px] font-semibold tracking-wider uppercase">
            {section.title}
          </h2>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon name={item.icon} className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.comingSoon ? (
                      <span className="bg-muted text-muted-foreground ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">
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
