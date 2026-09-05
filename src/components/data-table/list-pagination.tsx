import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { type PageMeta, type RawSearchParams, buildListHref } from "@/lib/list-params";
import { cn } from "@/lib/utils";

/**
 * Pagination footer. Server-rendered links, so it works without JavaScript and
 * every page is directly linkable.
 */
export function ListPagination({
  meta,
  pathname,
  searchParams,
  itemLabel = "records",
}: {
  meta: PageMeta;
  pathname: string;
  searchParams: RawSearchParams;
  itemLabel?: string;
}) {
  if (meta.total === 0) return null;

  const previousHref = buildListHref(pathname, searchParams, { page: meta.page - 1 });
  const nextHref = buildListHref(pathname, searchParams, { page: meta.page + 1 });

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5"
    >
      <p className="text-muted-foreground text-sm">
        Showing <span className="text-foreground font-medium">{meta.from}</span>–
        <span className="text-foreground font-medium">{meta.to}</span> of{" "}
        <span className="text-foreground font-medium">{meta.total}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          Page {meta.page} of {meta.totalPages}
        </span>

        {meta.hasPrevious ? (
          <Link
            href={previousHref}
            rel="prev"
            aria-label="Previous page"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ChevronLeft aria-hidden />
            Previous
          </Link>
        ) : (
          <span
            aria-disabled
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50")}
          >
            <ChevronLeft aria-hidden />
            Previous
          </span>
        )}

        {meta.hasNext ? (
          <Link
            href={nextHref}
            rel="next"
            aria-label="Next page"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Next
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span
            aria-disabled
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "opacity-50")}
          >
            Next
            <ChevronRight aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
