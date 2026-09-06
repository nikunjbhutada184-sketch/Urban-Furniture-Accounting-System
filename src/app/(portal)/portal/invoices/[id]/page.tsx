import { InvoiceStatus } from "@prisma/client";
import { Download } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount } from "@/components/ui/amount";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PayInvoiceDialog } from "@/modules/portal/components/pay-invoice-dialog";
import { getPortalInvoice } from "@/modules/portal/portal-service";
import { InvoiceStatusBadge } from "@/modules/shared/components/status-badge";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Invoice" };

/**
 * One of the customer's own invoices.
 *
 * The lookup is scoped by `customerId` in the WHERE clause, so another
 * contact's invoice id returns nothing and this page 404s — it does not leak
 * the existence of the document.
 */
export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermissionOrRedirect("portal:view-own");
  const { id } = await params;

  if (!actor.contactId) notFound();

  const invoice = await getPortalInvoice({ contactId: actor.contactId, invoiceId: id });
  if (!invoice) notFound();

  const outstanding = toAmountString(invoice.amountResidual);
  const canPay =
    can(actor, "portal:pay-own") &&
    Number(outstanding) > 0 &&
    invoice.status !== InvoiceStatus.PAID;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/portal/invoices" className="text-muted-foreground text-sm hover:underline">
            ← All invoices
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{invoice.number}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Issued {invoice.invoiceDate.toISOString().slice(0, 10)}
            {invoice.dueDate ? ` · due ${invoice.dueDate.toISOString().slice(0, 10)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InvoiceStatusBadge status={invoice.status} />

          <a
            href={`/portal/invoices/${invoice.id}/pdf`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "rounded-full")}
          >
            <Download className="size-4" aria-hidden />
            PDF
          </a>

          {canPay ? (
            <PayInvoiceDialog
              invoiceId={invoice.id}
              invoiceNumber={invoice.number}
              amountResidual={outstanding}
            />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What you were charged for</CardTitle>
          {invoice.reference ? (
            <CardDescription>Your reference: {invoice.reference}</CardDescription>
          ) : null}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {invoice.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.description}</TableCell>
                    <TableCell className="tabular text-right">{line.quantity.toString()}</TableCell>
                    <TableCell className="tabular text-right">
                      {line.unitPrice.toString()}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {toAmountString(line.taxAmount)}
                    </TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {toAmountString(line.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end border-t p-4">
            <dl className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular">{toAmountString(invoice.amountUntaxed)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular">{toAmountString(invoice.amountTax)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1.5 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{toAmountString(invoice.amountTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular">{toAmountString(invoice.amountPaid)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t pt-1.5">
                <dt className="font-semibold">Amount due</dt>
                <dd>
                  <Amount value={outstanding} />
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {invoice.allocations.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payments received</CardTitle>
            <CardDescription>Payments applied to this invoice.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="font-medium">{allocation.payment.number}</TableCell>
                    <TableCell className="text-muted-foreground tabular text-xs">
                      {allocation.payment.paymentDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {allocation.payment.method}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={toAmountString(allocation.amount)} size="sm" />
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
