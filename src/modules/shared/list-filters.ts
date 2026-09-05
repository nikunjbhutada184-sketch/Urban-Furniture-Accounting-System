/**
 * Shared list filters used by every master-data module.
 *
 * Master data is archived rather than deleted, so every list needs a
 * three-way "which records" filter. Active-only is the default: archived
 * records are history, not working data.
 */

export const ARCHIVE_STATUS_VALUES = ["active", "archived", "all"] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUS_VALUES)[number];

export const ARCHIVE_FILTER_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

/** Prisma `where` fragment for the archive filter. */
export function archiveWhere(status: string | undefined): { isArchived?: boolean } {
  if (status === "archived") return { isArchived: true };
  if (status === "all") return {};
  return { isArchived: false };
}

/** Case-insensitive "contains" across several columns. */
export function searchWhere<T extends string>(
  search: string,
  fields: readonly T[],
): { OR: Record<string, { contains: string; mode: "insensitive" }>[] } | Record<string, never> {
  if (!search) return {};

  return {
    OR: fields.map((field) => ({
      [field]: { contains: search, mode: "insensitive" as const },
    })),
  };
}
