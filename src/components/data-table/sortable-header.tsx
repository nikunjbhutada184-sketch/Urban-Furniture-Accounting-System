import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { TableHead } from "@/components/ui/table";
import { type RawSearchParams, type SortDirection, buildListHref } from "@/lib/list-params";
import { cn } from "@/lib/utils";

/**
 * A column header that toggles sorting through the URL.
 *
 * Rendered on the server as a plain link, so sorting works without JavaScript
 * and needs no client component.
 */
export function SortableHeader({
  field,
  label,
  pathname,
  searchParams,
  currentSort,
  currentDirection,
  align = "left",
  className,
}: {
  field: string;
  label: string;
  pathname: string;
  searchParams: RawSearchParams;
  currentSort: string;
  currentDirection: SortDirection;
  align?: "left" | "right";
  className?: string;
}) {
  const isActive = currentSort === field;
  const nextDirection: SortDirection = isActive && currentDirection === "asc" ? "desc" : "asc";

  const Icon = !isActive ? ArrowUpDown : currentDirection === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <Link
        href={buildListHref(pathname, searchParams, { sort: field, dir: nextDirection })}
        aria-label={`Sort by ${label}, ${nextDirection}ending`}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1 transition-colors",
          align === "right" && "flex-row-reverse",
          isActive && "text-foreground",
        )}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </Link>
    </TableHead>
  );
}
