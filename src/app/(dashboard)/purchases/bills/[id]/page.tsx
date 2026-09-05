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
  cancelVendorBillAction,
  postVendorBillAction,
  registerBillPaymentAction,
} from "@/modules/purchases/actions";
import { DocumentActionButton } from "@/modules/shared/components/document-action-button";
import { PaymentDialog } from "@/modules/shared/components/payment-dialog";
import { BillStatusBadge } from "@/modules/purchases/components/status-badge";
import { getVendorBill } from "@/modules/purchases/vendor-bill-service";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";
import { toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Vendor bill" };

export default async function VendorBillPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const { id } = await params;

  const bill = await getVendorBill(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const paymentJournals = await listJournalOptions([JournalType.BANK, JournalType.CASH]);

  const canPost = can(actor, "transaction:post");
  const canCancel = can(actor, "transaction:cancel");
  const canPay = can(actor, "payment:post");

  const isDraft = bill.status === InvoiceStatus.DRAFT;
  const isPayable =
    bill.status === InvoiceStatus.POSTED || bill.status === InvoiceStatus.PARTIALLY_PAID;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={bill.number} description={`Vendor: ${bill.vendor.name}`}>
        <BillStatusBadge status={bill.status} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {isDraft && canPost ? (
          <DocumentActionButton
            action={postVendorBillAction.bind(null, bill.id)}
            label="Post to ledger"
            title="Post this bill?"
            description="Posting creates the journal entry (Dr expense and input tax, Cr creditors) and makes the bill payable. Posted entries are immutable — corrections are made by reversal."
            confirmLabel="Post bill"
          />
        ) : null}

        {isPayable && canPay ? (
          <PaymentDialog
            action={registerBillPaymentAction.bind(null, bill.id)}
            documentNumber={bill.number}
            partnerName={bill.vendor.name}
            direction="send"
            triggerLabel="Pay"
            title="Bill Payment"
            currencyNote="Records money paid out"
            amountResidual={toAmountString(bill.amountResidual)}
            journals={paymentJournals.map((journal) => ({
              id: journal.id,
              label: `${journal.code} · ${journal.name}`,
              method: journal.type === JournalType.CASH ? "CASH" : "BANK",
            }))}
          />
        ) : null}

        {isDraft && canCancel ? (
          <DocumentActionButton
            action={cancelVendorBillAction.bind(null, bill.id)}
            label="Cancel bill"
            title="Cancel this draft bill?"
            description="The bill will be cancelled and its purchase order reopened for billing. Only draft bills can be cancelled."
            variant="outline"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Invoice date", value: bill.invoiceDate.toISOString().slice(0, 10) },
          { label: "Due date", value: bill.dueDate?.toISOString().slice(0, 10) ?? "—" },
          { label: "Total", value: toAmountString(bill.amountTotal) },
          { label: "Outstanding", value: toAmountString(bill.amountResidual) },
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
          {bill.purchaseOrder ? (
            <CardDescription>
              Converted from{" "}
              <Link
                href={`/purchases/orders/${bill.purchaseOrder.id}`}
                className="underline underline-offset-2"
              >
                {bill.purchaseOrder.number}
              </Link>
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Expense account</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bill.lines.map((line) => (
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
                <dd className="tabular">{toAmountString(bill.amountUntaxed)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular">{toAmountString(bill.amountTax)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{toAmountString(bill.amountTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular">{toAmountString(bill.amountPaid)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Outstanding</dt>
                <dd className="tabular">{toAmountString(bill.amountResidual)}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {bill.journalEntry ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Journal entry {bill.journalEntry.number}</CardTitle>
            <CardDescription>
              Posted {bill.journalEntry.date.toISOString().slice(0, 10)} in {bill.journal.name}.
              Posted entries cannot be edited or deleted.
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
                {bill.journalEntry.items.map((item) => (
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

      {bill.allocations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
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
                {bill.allocations.map((allocation) => (
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
