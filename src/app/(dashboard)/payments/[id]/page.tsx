import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
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
import { getPayment } from "@/modules/payments/payment-queries";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";
import { toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("payment:view");
  const { id } = await params;

  const payment = await getPayment(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const inbound = payment.direction === "INBOUND";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={payment.number}
        description={`${inbound ? "Received from" : "Paid to"} ${payment.contact.name}`}
        action={{ label: "All payments", href: "/payments" }}
      >
        <Badge variant={payment.status === "POSTED" ? "success" : "secondary"}>
          {payment.status === "POSTED" ? "Posted" : payment.status}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Amount", value: toAmountString(payment.amount) },
          { label: "Date", value: payment.paymentDate.toISOString().slice(0, 10) },
          { label: "Method", value: payment.method },
          { label: "Reference", value: payment.reference ?? "—" },
        ].map((item) => (
          <Card key={item.label} className="card-float">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="tabular truncate text-sm font-medium">
              {item.value}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-float">
        <CardHeader>
          <CardTitle className="text-base">Settled documents</CardTitle>
          <CardDescription>
            What this payment was allocated against. One payment can settle several documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead className="text-right">Document total</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payment.allocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground py-6 text-center text-sm">
                    Not allocated to any document.
                  </TableCell>
                </TableRow>
              ) : (
                payment.allocations.map((allocation) => {
                  const document = allocation.customerInvoice ?? allocation.vendorBill;
                  const href = allocation.customerInvoice
                    ? `/sales/invoices/${allocation.customerInvoice.id}`
                    : allocation.vendorBill
                      ? `/purchases/bills/${allocation.vendorBill.id}`
                      : null;

                  return (
                    <TableRow key={allocation.id}>
                      <TableCell className="font-medium">
                        {href ? (
                          <Link href={href} className="hover:underline">
                            {document?.number}
                          </Link>
                        ) : (
                          (document?.number ?? "—")
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {document ? (
                          <Amount value={toAmountString(document.amountTotal)} size="sm" />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={toAmountString(allocation.amount)} size="sm" />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {payment.journalEntry ? (
        <Card className="card-float">
          <CardHeader>
            <CardTitle className="text-base">
              Journal entry{" "}
              <Link
                href={`/journal-entries/${payment.journalEntry.id}`}
                className="underline underline-offset-2"
              >
                {payment.journalEntry.number}
              </Link>
            </CardTitle>
            <CardDescription>
              Posted {payment.journalEntry.date.toISOString().slice(0, 10)} in{" "}
              {payment.journal.name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payment.journalEntry.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className="tabular text-muted-foreground mr-2 text-xs">
                        {item.account.code}
                      </span>
                      {item.account.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.debit.isZero() ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Amount value={toAmountString(item.debit)} size="sm" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.credit.isZero() ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Amount value={toAmountString(item.credit)} size="sm" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
