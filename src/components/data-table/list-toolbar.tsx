"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterConfig {
  /** Query-string key, e.g. "type". */
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Value meaning "no filter". Removed from the URL when selected. */
  allValue?: string;
}

/**
 * Search + filter bar for a list page.
 *
 * Writes to the URL rather than to component state, so the server component
 * below re-renders with the new data and the view stays shareable. Search is
 * debounced; `useTransition` keeps the input responsive while the server
 * streams the new list.
 */
export function ListToolbar({
  searchPlaceholder = "Search...",
  filters = [],
}: {
  searchPlaceholder?: string;
  filters?: FilterConfig[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = searchParams.get("q") ?? "";
  const [draft, setDraft] = useState<string | null>(null);

  // The input shows the user's in-flight text, falling back to the URL. Reset
  // links and back/forward therefore flow straight through, with no effect
  // syncing state between the two.
  const query = draft ?? urlQuery;

  function push(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    // Any filter or search change returns to the first page.
    params.delete("page");

    const queryString = params.toString();
    startTransition(() => router.push(queryString ? `${pathname}?${queryString}` : pathname));
  }

  // Debounce the search box so we do not issue a request per keystroke.
  useEffect(() => {
    if (draft === null || draft === urlQuery) return;

    const timer = setTimeout(() => push({ q: draft || undefined }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, urlQuery]);

  const hasActiveFilters =
    Boolean(searchParams.get("q")) ||
    filters.some((filter) => Boolean(searchParams.get(filter.name)));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="pl-8"
        />
      </div>

      {filters.map((filter) => {
        const allValue = filter.allValue ?? "all";
        return (
          <Select
            key={filter.name}
            value={searchParams.get(filter.name) ?? allValue}
            onValueChange={(value) => push({ [filter.name]: value })}
          >
            <SelectTrigger className="w-[168px]" aria-label={filter.label}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allValue}>{filter.label}: All</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      {hasActiveFilters ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href={pathname}>
            <X aria-hidden />
            Reset
          </Link>
        </Button>
      ) : null}

      <span aria-live="polite" className="sr-only">
        {isPending ? "Updating results" : ""}
      </span>
    </div>
  );
}
