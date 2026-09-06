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
import { AGEING_BUCKETS, type AgeingReport } from "@/modules/reporting/partner-ledger-service";

/**
 * Ageing buckets for customers or vendors.
 *
 * The bucket a row falls into is decided server-side from the document's due
 * date; this only renders it. The "oldest" badge is the number an accountant
 * chases on, so it gets its own column rather than being buried in a bucket.
 */
export function AgeingTable({
  report,
  side,
}: {
  report: AgeingReport;
  side: "RECEIVABLE" | "PAYABLE";
}) {
  const isReceivable = side === "RECEIVABLE";

  if (report.rows.length === 0) {
    return (
      <EmptyState
        title={isReceivable ? "Nothing outstanding" : "Nothing owed"}
        description={
          isReceivable
            ? "Every posted invoice has been paid in full."
            : "Every posted bill has been paid in full."
        }
        action={{
          label: isReceivable ? "Customer invoices" : "Vendor bills",
          href: isReceivable ? "/sales/invoices" : "/purchases/bills",
        }}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{isReceivable ? "Customer" : "Vendor"}</TableHead>
            {AGEING_BUCKETS.map((bucket) => (
              <TableHead key={bucket.key} className="text-right">
                {bucket.label}
              </TableHead>
            ))}
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Oldest</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {report.rows.map((row) => (
            <TableRow key={row.contactId}>
              <TableCell className="font-medium">
                <Link
                  href={`/reports/partner-ledger?contact=${row.contactId}&side=${side}`}
                  className="hover:underline"
                >
                  {row.contactName}
                </Link>
              </TableCell>

              {AGEING_BUCKETS.map((bucket) => {
                const value = row.buckets[bucket.key];
                return (
                  <TableCell key={bucket.key} className="text-right">
                    {Number(value) === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Amount value={value} size="sm" />
                    )}
                  </TableCell>
                );
              })}

              <TableCell className="text-right">
                <Amount value={row.total} size="sm" />
              </TableCell>

              <TableCell className="text-right">
                {row.oldestDays > 90 ? (
                  <Badge variant="destructive">{row.oldestDays}d</Badge>
                ) : row.oldestDays > 0 ? (
                  <Badge variant="secondary">{row.oldestDays}d</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">Not due</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            {AGEING_BUCKETS.map((bucket) => (
              <TableCell key={bucket.key} className="text-right">
                <Amount value={report.totals[bucket.key]} size="sm" />
              </TableCell>
            ))}
            <TableCell className="text-right">
              <Amount value={report.grandTotal} size="sm" />
            </TableCell>
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
