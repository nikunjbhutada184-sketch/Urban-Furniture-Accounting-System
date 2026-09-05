import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder for a list page, rendered by `loading.tsx` while the
 * server component streams.
 */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="rounded-xl border">
        <div className="flex gap-4 border-b px-3 py-2.5">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 border-b px-3 py-3 last:border-0">
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton key={columnIndex} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
