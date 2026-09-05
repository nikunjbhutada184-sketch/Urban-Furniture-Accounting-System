/**
 * List-page query parameters.
 *
 * Every master-data list page is driven by the URL: search, filters, sort and
 * page all live in `searchParams`. That keeps list pages server-rendered and
 * shareable/bookmarkable, and means "loading" is just Next.js streaming.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type SortDirection = "asc" | "desc";

export interface ListParams<TSortField extends string = string> {
  search: string;
  page: number;
  perPage: number;
  sort: TSortField;
  direction: SortDirection;
  /** Free-form filters, already narrowed to the allowed values by the caller. */
  filters: Record<string, string>;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toPositiveInt(value: string | undefined, fallback: number, max = 100_000): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

/**
 * Parses raw search params into a validated shape.
 *
 * `allowedSorts` and `allowedFilters` are whitelists: anything not on them is
 * discarded, so a hand-edited URL can never reach the database with an
 * arbitrary column name or filter value.
 */
export function parseListParams<TSortField extends string>(options: {
  searchParams: RawSearchParams;
  allowedSorts: readonly TSortField[];
  defaultSort: TSortField;
  defaultDirection?: SortDirection;
  allowedFilters?: Record<string, readonly string[]>;
}): ListParams<TSortField> {
  const { searchParams, allowedSorts, defaultSort, defaultDirection = "asc" } = options;

  const rawSort = first(searchParams.sort);
  const sort = allowedSorts.includes(rawSort as TSortField) ? (rawSort as TSortField) : defaultSort;

  const rawDirection = first(searchParams.dir);
  const direction: SortDirection =
    rawDirection === "desc" || rawDirection === "asc" ? rawDirection : defaultDirection;

  const perPageRaw = toPositiveInt(first(searchParams.perPage), DEFAULT_PAGE_SIZE);
  const perPage = (PAGE_SIZE_OPTIONS as readonly number[]).includes(perPageRaw)
    ? perPageRaw
    : DEFAULT_PAGE_SIZE;

  const filters: Record<string, string> = {};
  for (const [key, allowedValues] of Object.entries(options.allowedFilters ?? {})) {
    const value = first(searchParams[key]);
    if (value && allowedValues.includes(value)) filters[key] = value;
  }

  return {
    search: (first(searchParams.q) ?? "").trim().slice(0, 200),
    page: toPositiveInt(first(searchParams.page), 1),
    perPage,
    sort,
    direction,
    filters,
  };
}

/** Offset/limit for Prisma from a parsed page. */
export function toSkipTake(params: Pick<ListParams, "page" | "perPage">): {
  skip: number;
  take: number;
} {
  return { skip: (params.page - 1) * params.perPage, take: params.perPage };
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function buildPageMeta(params: ListParams, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const page = Math.min(params.page, totalPages);
  const from = total === 0 ? 0 : (page - 1) * params.perPage + 1;
  const to = Math.min(page * params.perPage, total);

  return {
    page,
    perPage: params.perPage,
    total,
    totalPages,
    from,
    to,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}

/**
 * Builds a URL for the same list page with some params changed.
 * Empty values are removed, and any change resets to page 1 unless the change
 * *is* the page.
 */
export function buildListHref(
  pathname: string,
  current: RawSearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(current)) {
    const single = first(value);
    if (single) params.set(key, single);
  }

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "" || value === "all") params.delete(key);
    else params.set(key, String(value));
  }

  if (!("page" in changes)) params.delete("page");

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
