"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type MenuColumn } from "@/components/app-shell/menu-model";
import { cn } from "@/lib/utils";

/**
 * The four-column application menu, opened by clicking a column heading.
 *
 * The headings are always visible; clicking one drops the whole panel so every
 * destination is a single click away, as in the dashboard mockup. Escape and a
 * click outside close it, and navigating closes it too.
 */
export function AppMenu({ columns }: { columns: MenuColumn[] }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * The route the panel was opened on, rather than a plain boolean.
   *
   * Navigating changes `pathname`, which closes the panel by derivation --
   * the destination is now on screen, so there is nothing to keep open. State
   * derived this way needs no effect to keep it in sync.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  useEffect(() => {
    if (!open) return;

    // `setOpenedAt` rather than the `setOpen` helper: the state setter is
    // stable, so the listeners do not need re-attaching on every render.
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpenedAt(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedAt(null);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (columns.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <nav aria-label="Application menu" className="flex items-center gap-1">
        {columns.map((column) => (
          <button
            key={column.title}
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="app-menu-panel"
            className={cn(
              "text-muted-foreground hover:text-foreground hover:bg-card flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              open && "text-foreground bg-card",
            )}
          >
            {column.title}
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        ))}
      </nav>

      <div
        id="app-menu-panel"
        hidden={!open}
        className="surface bg-card absolute top-full left-0 z-50 mt-2 w-max max-w-[min(56rem,90vw)] rounded-3xl border p-5"
      >
        <div
          className="grid gap-x-10 gap-y-6"
          style={{ gridTemplateColumns: `repeat(${Math.min(columns.length, 4)}, minmax(0, 1fr))` }}
        >
          {columns.map((column) => (
            <div key={column.title}>
              <p className="border-b pb-2 text-sm font-semibold">{column.title}</p>
              <ul className="mt-2 space-y-0.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:bg-secondary hover:text-foreground -mx-2 block truncate rounded-lg px-2 py-1.5 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
