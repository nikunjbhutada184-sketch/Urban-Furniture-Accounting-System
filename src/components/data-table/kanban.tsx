import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Kanban card grid.
 *
 * The card view of a list: the same rows, the same search/filter/sort/paging,
 * rendered as cards instead of table rows. Each card links to the record's
 * form view, matching the mockups.
 */

export function KanbanGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function KanbanCard({
  href,
  children,
  muted,
}: {
  href: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "bg-card hover:border-ring focus-visible:ring-ring block rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none",
        muted && "opacity-60",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The image slot on a card.
 *
 * Falls back to the record's initials when there is no picture, so cards keep a
 * consistent shape whether or not an image was uploaded.
 */
export function KanbanThumbnail({
  src,
  alt,
  fallback,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
}) {
  if (src) {
    return (
      // Profile images are arbitrary user-supplied URLs, not on a configured
      // next/image domain, so a plain <img> is the correct choice here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="size-14 shrink-0 rounded-md border object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="bg-muted text-muted-foreground flex size-14 shrink-0 items-center justify-center rounded-md border text-sm font-medium"
    >
      {fallback}
    </div>
  );
}

/** Two-line label/value pair used inside cards. */
export function KanbanField({
  label,
  value,
  tabular,
}: {
  label: string;
  value: React.ReactNode;
  tabular?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", tabular && "tabular")}>{value}</span>
    </div>
  );
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
