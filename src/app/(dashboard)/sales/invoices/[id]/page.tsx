import { InvoiceStatus, JournalType } from "@prisma/client";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listJournalOptions } from "@/modules/journals/journal-service";
import {
  cancelCustomerInvoiceAction,
  postCustomerInvoiceAction,
  receiveInvoicePaymentAction,
} from "@/modules/sales/actions";
import { getCustomerInvoice } from "@/modules/sales/customer-invoice-service";
import { DocumentActionButton } from "@/modules/shared/components/document-action-button";
import { DocumentPdfLink } from "@/modules/shared/components/document-pdf-link";
import { PaymentDialog } from "@/modules/shared/components/payment-dialog";
import { InvoiceStatusBadge } from "@/modules/shared/components/status-badge";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";
import { toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Customer invoice" };

export default async function CustomerInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const { id } = await params;

  const invoice = await getCustomerInvoice(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const paymentJournals = await listJournalOptions([JournalType.BANK, JournalType.CASH]);

  const canPost = can(actor, "transaction:post");
  const canCancel = can(actor, "transaction:cancel");
  const canPay = can(actor, "payment:post");

  const isDraft = invoice.status === InvoiceStatus.DRAFT;
  const isCollectable =
    invoice.status === InvoiceStatus.POSTED || invoice.status === InvoiceStatus.PARTIALLY_PAID;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={invoice.number} description={`Customer: ${invoice.customer.name}`}>
        <DocumentPdfLink href={`/sales/invoices/${invoice.id}/pdf`} />
        <InvoiceStatusBadge status={invoice.status} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {isDraft && canPost ? (
          <DocumentActionButton
            action={postCustomerInvoiceAction.bind(null, invoice.id)}
            label="Post to ledger"
            title="Post this invoice?"
            description="Posting creates the journal entry (Dr debtors, Cr sales income and tax payable), ships stock for tracked goods, and makes the invoice collectable. Posted entries are immutable — corrections are made by reversal."
            confirmLabel="Post invoice"
          />
        ) : null}

        {isCollectable && canPay ? (
          <PaymentDialog
            action={receiveInvoicePaymentAction.bind(null, invoice.id)}
            documentNumber={invoice.number}
            partnerName={invoice.customer.name}
            direction="receive"
            amountResidual={toAmountString(invoice.amountResidual)}
            triggerLabel="Pay"
            title="Invoice Payment"
            currencyNote="Records money received"
            journals={paymentJournals.map((journal) => ({
              id: journal.id,
              label: `${journal.code} · ${journal.name}`,
              method: journal.type === JournalType.CASH ? "CASH" : "BANK",
            }))}
          />
        ) : null}

        {isDraft && canCancel ? (
          <DocumentActionButton
            action={cancelCustomerInvoiceAction.bind(null, invoice.id)}
            label="Cancel invoice"
            title="Cancel this draft invoice?"
            description="The invoice will be cancelled and its sales order reopened for invoicing. Only draft invoices can be cancelled."
            variant="outline"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Invoice date", value: invoice.invoiceDate.toISOString().slice(0, 10) },
          { label: "Due date", value: invoice.dueDate?.toISOString().slice(0, 10) ?? "—" },
          { label: "Total", value: toAmountString(invoice.amountTotal) },
          { label: "Outstanding", value: toAmountString(invoice.amountResidual) },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="tabular text-sm font-medium">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
          {invoice.salesOrder ? (
            <CardDescription>
              Generated from{" "}
              <Link
                href={`/sales/orders/${invoice.salesOrder.id}`}
                className="underline underline-offset-2"
              >
                {invoice.salesOrder.number}
              </Link>
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Income account</TableHead>
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
                  <TableCell className="text-muted-foreground text-xs">
                    {line.account.code} · {line.account.name}
                  </TableCell>
                  <TableCell className="tabular text-right">{line.quantity.toString()}</TableCell>
                  <TableCell className="tabular text-right">{line.unitPrice.toString()}</TableCell>
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

          <div className="flex justify-end border-t p-4">
            <dl className="w-56 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Untaxed</dt>
                <dd className="tabular">{toAmountString(invoice.amountUntaxed)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular">{toAmountString(invoice.amountTax)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{toAmountString(invoice.amountTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Received</dt>
                <dd className="tabular">{toAmountString(invoice.amountPaid)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Outstanding</dt>
                <dd className="tabular">{toAmountString(invoice.amountResidual)}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {invoice.journalEntry ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Journal entry {invoice.journalEntry.number}</CardTitle>
            <CardDescription>
              Posted {invoice.journalEntry.date.toISOString().slice(0, 10)} in{" "}
              {invoice.journal.name}. Posted entries cannot be edited or deleted.
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
                {invoice.journalEntry.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">
                      {item.account.code} · {item.account.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {item.description ?? "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {item.debit.isZero() ? "" : toAmountString(item.debit)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {item.credit.isZero() ? "" : toAmountString(item.credit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {invoice.allocations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments received</CardTitle>
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
                    <TableCell className="tabular text-muted-foreground">
                      {allocation.payment.paymentDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {allocation.payment.method}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {toAmountString(allocation.amount)}
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
