import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type PortalDocumentRow } from "@/modules/portal/portal-service";
import { InvoiceStatusBadge } from "@/modules/shared/components/status-badge";

/**
 * A contact's own documents.
 *
 * `basePath` decides where a row links; pass `null` for bills, which have no
 * portal detail page of their own.
 */
export function PortalDocumentTable({
  rows,
  basePath,
  label = "Invoice",
}: {
  rows: PortalDocumentRow[];
  basePath: string | null;
  label?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">
                {basePath ? (
                  <Link href={`${basePath}/${row.id}`} className="hover:underline">
                    {row.number}
                  </Link>
                ) : (
                  row.number
                )}
              </TableCell>

              <TableCell className="text-muted-foreground tabular text-xs">
                {row.date.toISOString().slice(0, 10)}
              </TableCell>

              <TableCell className="tabular text-xs">
                {row.isOverdue ? (
                  <Badge variant="destructive">
                    {row.dueDate?.toISOString().slice(0, 10) ?? "Overdue"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">
                    {row.dueDate?.toISOString().slice(0, 10) ?? "—"}
                  </span>
                )}
              </TableCell>

              <TableCell>
                <InvoiceStatusBadge status={row.status} />
              </TableCell>

              <TableCell className="text-right">
                <Amount value={row.total} size="sm" />
              </TableCell>

              <TableCell className="text-right">
                <Amount value={row.outstanding} size="sm" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
