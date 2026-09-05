import { AlertTriangle } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCustomerOutstanding } from "@/modules/payments/customer-payment-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Customer outstanding" };

export default async function CustomerOutstandingPage() {
  await requirePermissionOrRedirect("report:view");

  const rows = await getCustomerOutstanding();

  const totalOutstanding = rows.reduce((sum, row) => sum + Number(row.outstanding), 0);
  const totalOverdue = rows.reduce((sum, row) => sum + row.overdueInvoices, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Customer outstanding"
        description="What each customer still owes, from the documents and from the ledger."
        action={{ label: "Back to invoices", href: "/sales/invoices" }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Total outstanding
            </CardTitle>
          </CardHeader>
          <CardContent className="tabular text-lg font-semibold">
            {totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Customers owing
            </CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{rows.length}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Overdue invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{totalOverdue}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By customer</CardTitle>
          <CardDescription>
            &quot;Documents&quot; sums the unpaid invoice balances. &quot;Ledger&quot; is the
            receivable account balance for that contact. They should agree — a difference means
            something reached the ledger outside the invoice flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              description="Every posted invoice has been paid in full."
              action={{ label: "View invoices", href: "/sales/invoices" }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Open invoices</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Documents</TableHead>
                  <TableHead className="text-right">Ledger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const agrees = Number(row.outstanding) === Number(row.ledgerBalance);

                  return (
                    <TableRow key={row.contactId}>
                      <TableCell className="font-medium">
                        <Link href={`/contacts/${row.contactId}/edit`} className="hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular text-right">{row.openInvoices}</TableCell>
                      <TableCell className="tabular text-right">
                        {row.overdueInvoices > 0 ? (
                          <Badge variant="destructive">{row.overdueInvoices}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {row.outstanding}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        <span className={agrees ? "" : "text-destructive"}>
                          {row.ledgerBalance}
                        </span>
                        {agrees ? null : (
                          <AlertTriangle
                            className="text-destructive ml-1 inline size-3.5"
                            aria-label="Does not match the documents"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
