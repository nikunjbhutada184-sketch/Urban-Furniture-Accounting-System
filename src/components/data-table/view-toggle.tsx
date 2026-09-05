import { LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { type RawSearchParams, buildListHref } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export const VIEW_MODES = ["list", "kanban"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

/** Reads the view mode out of the URL, defaulting to the list. */
export function parseViewMode(searchParams: RawSearchParams): ViewMode {
  const raw = Array.isArray(searchParams.view) ? searchParams.view[0] : searchParams.view;
  return raw === "kanban" ? "kanban" : "list";
}

/**
 * List / Kanban switch.
 *
 * Server-rendered links that flip `?view=`, so the choice survives a reload,
 * is shareable, and keeps whatever search, filter and sort are already applied.
 */
export function ViewToggle({
  pathname,
  searchParams,
  current,
}: {
  pathname: string;
  searchParams: RawSearchParams;
  current: ViewMode;
}) {
  const options = [
    { mode: "list" as const, label: "List view", Icon: List },
    { mode: "kanban" as const, label: "Kanban view", Icon: LayoutGrid },
  ];

  return (
    <div
      role="group"
      aria-label="Switch view"
      className="border-input inline-flex items-center rounded-md border p-0.5"
    >
      {options.map(({ mode, label, Icon }) => {
        const isActive = current === mode;

        return (
          <Link
            key={mode}
            href={buildListHref(pathname, searchParams, {
              // "list" is the default, so it stays out of the URL.
              view: mode === "list" ? undefined : mode,
              page: undefined,
            })}
            aria-label={label}
            aria-current={isActive ? "true" : undefined}
            title={label}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </Link>
        );
      })}
    </div>
  );
}
