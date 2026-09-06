"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/app-shell/sidebar";
import { type NavSection } from "@/components/app-shell/nav-items";

/**
 * Navigation drawer for narrow screens.
 *
 * The sidebar is hidden below `lg`, which left the whole app unreachable on a
 * phone. This puts the same sections — already filtered by permission on the
 * server — behind a button, and reuses `Sidebar` so there is one navigation
 * component rather than two that can drift.
 */
export function MobileNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();

  /**
   * The route the drawer was opened on, rather than a boolean: navigating
   * changes `pathname`, which closes it by derivation. No effect needed to keep
   * the two in sync.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedAt(null);
    }

    document.addEventListener("keydown", onKeyDown);
    // The page behind a full-height drawer must not scroll with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpenedAt(pathname)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="bg-card text-muted-foreground hover:text-foreground flex size-10 items-center justify-center rounded-full transition-colors"
      >
        <Menu className="size-4" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex">
          {/*
            A button rather than a div: dismissing by tapping the backdrop has
            to be reachable from the keyboard and announced to a screen reader.
          */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpenedAt(null)}
            className="absolute inset-0 bg-black/40"
          />

          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="bg-background relative flex h-full w-[280px] max-w-[85vw] flex-col shadow-xl"
          >
            <div className="flex h-[64px] shrink-0 items-center justify-between px-4">
              <span className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-xs font-bold">
                  UF
                </span>
                <span className="text-sm font-semibold tracking-tight">Urban Furniture</span>
              </span>

              <button
                type="button"
                onClick={() => setOpenedAt(null)}
                aria-label="Close navigation"
                className="text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-full transition-colors"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <Sidebar sections={sections} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
