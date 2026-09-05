import { JournalType, PurchaseOrderStatus } from "@prisma/client";
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
import {
  cancelPurchaseOrderAction,
  confirmPurchaseOrderAction,
  convertToBillAction,
} from "@/modules/purchases/actions";
import { ConvertToBillDialog } from "@/modules/purchases/components/convert-to-bill-dialog";
import { DocumentActionButton } from "@/modules/purchases/components/document-action-button";
import { OrderStatusBadge, BillStatusBadge } from "@/modules/purchases/components/status-badge";
import { getPurchaseOrder } from "@/modules/purchases/purchase-order-service";
import { listJournalOptions } from "@/modules/journals/journal-service";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";
import { toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const { id } = await params;

  const order = await getPurchaseOrder(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const purchaseJournals = await listJournalOptions([JournalType.PURCHASE]);

  const canUpdate = can(actor, "transaction:update");
  const canCancel = can(actor, "transaction:cancel");
  const canCreate = can(actor, "transaction:create");

  const isDraft = order.status === PurchaseOrderStatus.DRAFT;
  const isConfirmed = order.status === PurchaseOrderStatus.CONFIRMED;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={order.number} description={`Vendor: ${order.vendor.name}`}>
        <OrderStatusBadge status={order.status} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        {isDraft && canUpdate ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/purchases/orders/${order.id}/edit`}>Edit</Link>
            </Button>
            <DocumentActionButton
              action={confirmPurchaseOrderAction.bind(null, order.id)}
              label="Confirm order"
              title="Confirm this purchase order?"
              description="Confirming locks the order for editing and allows it to be converted into a vendor bill when the goods arrive. No accounting entry is created."
            />
          </>
        ) : null}

        {isConfirmed && canCreate ? (
          <ConvertToBillDialog
            action={convertToBillAction}
            purchaseOrderId={order.id}
            purchaseOrderNumber={order.number}
            journals={purchaseJournals.map((journal) => ({
              id: journal.id,
              label: `${journal.code} · ${journal.name}`,
            }))}
          />
        ) : null}

        {(isDraft || isConfirmed) && canCancel ? (
          <DocumentActionButton
            action={cancelPurchaseOrderAction.bind(null, order.id)}
            label="Cancel order"
            title="Cancel this purchase order?"
            description="The order will be marked cancelled. This cannot be undone, and an order that has already been billed cannot be cancelled."
            variant="outline"
          />
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Order date
            </CardTitle>
          </CardHeader>
          <CardContent className="tabular text-sm">
            {order.orderDate.toISOString().slice(0, 10)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Expected
            </CardTitle>
          </CardHeader>
          <CardContent className="tabular text-sm">
            {order.expectedDate?.toISOString().slice(0, 10) ?? "—"}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
              Reference
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{order.reference ?? "—"}</CardContent>
        </Card>
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

      {order.bills.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor bills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.bills.map((bill) => (
              <div key={bill.id} className="flex items-center justify-between">
                <Link href={`/purchases/bills/${bill.id}`} className="text-sm hover:underline">
                  {bill.number}
                </Link>
                <BillStatusBadge status={bill.status} />
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
