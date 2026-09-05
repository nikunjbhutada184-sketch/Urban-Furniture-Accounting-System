import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams, buildPageMeta, parseListParams } from "@/lib/list-params";
import { OrderStatusBadge } from "@/modules/purchases/components/status-badge";
import { listPurchaseOrders } from "@/modules/purchases/purchase-order-service";
import {
  PURCHASE_ORDER_SORT_FIELDS,
  PURCHASE_ORDER_STATUS_OPTIONS,
} from "@/modules/purchases/schemas";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Purchase Orders" };

const PATHNAME = "/purchases/orders";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: PURCHASE_ORDER_SORT_FIELDS,
    defaultSort: "orderDate",
    defaultDirection: "desc",
    allowedFilters: {
      status: PURCHASE_ORDER_STATUS_OPTIONS.map((option) => option.value),
    },
  });

  const { rows, total } = await listPurchaseOrders(params);
  const meta = buildPageMeta(params, total);

  const canCreate = can(actor, "transaction:create");
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Purchase Orders"
        description="Commitments to buy. A purchase order becomes accounting when it is billed."
        action={canCreate ? { label: "New purchase order", href: `${PATHNAME}/new` } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search by number, reference or vendor..."
        filters={[
          {
            name: "status",
            label: "Status",
            options: PURCHASE_ORDER_STATUS_OPTIONS.map((option) => ({ ...option })),
          },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No purchase orders match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No purchase orders yet"
              description="Create a purchase order for a vendor, confirm it, then convert it to a bill when the goods arrive."
              action={
                canCreate ? { label: "New purchase order", href: `${PATHNAME}/new` } : undefined
              }
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    field="number"
                    label="Number"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead>Vendor</TableHead>
                  <SortableHeader
                    field="orderDate"
                    label="Order date"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="status"
                    label="Status"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="amountTotal"
                    label="Total"
                    align="right"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      <Link href={`${PATHNAME}/${order.id}`} className="hover:underline">
                        {order.number}
                      </Link>
                    </TableCell>
                    <TableCell>{order.vendorName}</TableCell>
                    <TableCell className="text-muted-foreground tabular">
                      {formatDate(order.orderDate)}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="tabular text-right">{order.amountTotal}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`${PATHNAME}/${order.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <ListPagination
              meta={meta}
              pathname={PATHNAME}
              searchParams={resolved}
              itemLabel="purchase orders"
            />
          </>
        )}
      </div>
    </div>
  );
}
