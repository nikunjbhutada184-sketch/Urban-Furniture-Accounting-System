import { type Metadata } from "next";
import { EmptyState } from "@/components/data-table/empty-state";
import { Amount } from "@/components/ui/amount";
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
import { listPortalPayments } from "@/modules/portal/portal-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "My payments" };

export default async function PortalPaymentsPage() {
  const actor = await requirePermissionOrRedirect("portal:view-own");
  if (!actor.contactId) return null;

  const payments = await listPortalPayments(actor.contactId);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My payments</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every payment recorded against your account.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payment history</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              description="Payments appear here once they have been recorded."
              action={{ label: "View invoices", href: "/portal/invoices" }}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.number}</TableCell>
                      <TableCell className="text-muted-foreground tabular text-xs">
                        {payment.date.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={payment.direction === "INBOUND" ? "success" : "secondary"}>
                          {payment.direction === "INBOUND" ? "You paid" : "Paid to you"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {payment.method}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {payment.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={payment.amount} size="sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
