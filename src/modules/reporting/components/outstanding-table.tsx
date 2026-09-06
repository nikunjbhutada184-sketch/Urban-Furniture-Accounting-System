import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type OutstandingReport } from "@/modules/reporting/report-service";

/**
 * Customer and vendor outstanding share a shape -- who owes what, on which
 * document, and whether it is overdue -- so they share one table.
 */
export function OutstandingTable({
  report,
  partyLabel,
  documentLabel,
  documentHrefPrefix,
  emptyTitle,
  emptyDescription,
  emptyAction,
}: {
  report: OutstandingReport;
  partyLabel: string;
  documentLabel: string;
  documentHrefPrefix: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction: { label: string; href: string };
}) {
  if (report.rows.length === 0) {
    return (
      <div className="card-float rounded-xl border">
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  return (
    <div className="card-float rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{partyLabel}</TableHead>
            <TableHead>{documentLabel}</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Due date</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {report.rows.map((row) => (
            <TableRow key={row.documentId}>
              <TableCell className="font-medium">{row.contactName}</TableCell>
              <TableCell>
                <Link
                  href={`${documentHrefPrefix}/${row.documentId}`}
                  className="hover:underline"
                >
                  {row.documentNumber}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground tabular">
                {row.documentDate.toISOString().slice(0, 10)}
              </TableCell>
              <TableCell className="tabular">
                <span className={row.isOverdue ? "text-destructive" : "text-muted-foreground"}>
                  {row.dueDate?.toISOString().slice(0, 10) ?? "—"}
                </span>
                {row.isOverdue ? (
                  <Badge variant="destructive" className="ml-2">
                    Overdue
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <Amount value={row.total} size="sm" />
              </TableCell>
              <TableCell className="text-right">
                <Amount value={row.paid} size="sm" />
              </TableCell>
              <TableCell className="text-right">
                <Amount value={row.outstanding} size="sm" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

        <TableFooter>
          <TableRow>
            <TableCell colSpan={6}>
              Total outstanding ({report.rows.length} document
              {report.rows.length === 1 ? "" : "s"})
            </TableCell>
            <TableCell className="text-right">
              <Amount value={report.totalOutstanding} size="sm" />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
