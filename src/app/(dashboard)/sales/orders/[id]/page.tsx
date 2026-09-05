import { JournalType, SalesOrderStatus } from "@prisma/client";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  cancelSalesOrderAction,
  confirmSalesOrderAction,
  convertToInvoiceAction,
} from "@/modules/sales/actions";
import { getSalesOrder } from "@/modules/sales/sales-order-service";
import { ConvertDocumentDialog } from "@/modules/shared/components/convert-document-dialog";
import { DocumentActionButton } from "@/modules/shared/components/document-action-button";
import {
  InvoiceStatusBadge,
  SalesOrderStatusBadge,
} from "@/modules/shared/components/status-badge";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";
import { toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Sales order" };

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const { id } = await params;

  const order = await getSalesOrder(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const salesJournals = await listJournalOptions([JournalType.SALES]);

  const canUpdate = can(actor, "transaction:update");
  const canCancel = can(actor, "transaction:cancel");
  const canCreate = can(actor, "transaction:create");

  const isDraft = order.status === SalesOrderStatus.DRAFT;
  const isConfirmed = order.status === SalesOrderStatus.CONFIRMED;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={order.number} description={`Customer: ${order.customer.name}`}>
        <SalesOrderStatusBadge status={order.status} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {isDraft && canUpdate ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/sales/orders/${order.id}/edit`}>Edit</Link>
            </Button>
            <DocumentActionButton
              action={confirmSalesOrderAction.bind(null, order.id)}
              label="Confirm order"
              title="Confirm this sales order?"
              description="Confirming locks the order for editing and allows the customer invoice to be generated. No accounting entry is created yet."
            />
          </>
        ) : null}

        {isConfirmed && canCreate ? (
          <ConvertDocumentDialog
            action={convertToInvoiceAction}
            orderId={order.id}
            orderNumber={order.number}
            orderFieldName="salesOrderId"
            successHref="/sales/invoices"
            triggerLabel="Generate invoice"
            title="Generate customer invoice"
            description="Creates the invoice for this order."
            referenceLabel="Reference"
            referencePlaceholder="Customer PO number"
            journals={salesJournals.map((journal) => ({
              id: journal.id,
              label: `${journal.code} · ${journal.name}`,
            }))}
          />
        ) : null}

        {(isDraft || isConfirmed) && canCancel ? (
          <DocumentActionButton
            action={cancelSalesOrderAction.bind(null, order.id)}
            label="Cancel order"
            title="Cancel this sales order?"
            description="The order will be marked cancelled. An order that has already been invoiced cannot be cancelled."
            variant="outline"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Order date", value: order.orderDate.toISOString().slice(0, 10) },
          { label: "Reference", value: order.reference ?? "—" },
          { label: "Total", value: toAmountString(order.amountTotal) },
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
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-medium">{line.description}</div>
                    {line.analyticAccount ? (
                      <div className="text-muted-foreground text-xs">
                        {line.analyticAccount.code} · {line.analyticAccount.name}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular text-right">{line.quantity.toString()}</TableCell>
                  <TableCell className="tabular text-right">{line.unitPrice.toString()}</TableCell>
                  <TableCell className="text-muted-foreground">{line.tax?.name ?? "—"}</TableCell>
                  <TableCell className="tabular text-right">
                    {toAmountString(line.subtotal)}
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
                <dd className="tabular">{toAmountString(order.amountUntaxed)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular">{toAmountString(order.amountTax)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{toAmountString(order.amountTotal)}</dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      {order.invoices.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between">
                <Link href={`/sales/invoices/${invoice.id}`} className="text-sm hover:underline">
                  {invoice.number}
                </Link>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {order.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm whitespace-pre-line">
            {order.notes}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
