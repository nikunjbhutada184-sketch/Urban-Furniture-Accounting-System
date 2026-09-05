import { TableSkeleton } from "@/components/data-table/table-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <TableSkeleton columns={6} />
    </div>
  );
}
