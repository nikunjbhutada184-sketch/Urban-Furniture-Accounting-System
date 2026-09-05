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
import { listSalesOrders } from "@/modules/sales/sales-order-service";
import { SALES_ORDER_SORT_FIELDS, SALES_ORDER_STATUS_OPTIONS } from "@/modules/sales/schemas";
import { SalesOrderStatusBadge } from "@/modules/shared/components/status-badge";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sales Orders" };

const PATHNAME = "/sales/orders";

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: SALES_ORDER_SORT_FIELDS,
    defaultSort: "orderDate",
    defaultDirection: "desc",
    allowedFilters: { status: SALES_ORDER_STATUS_OPTIONS.map((option) => option.value) },
  });

  const { rows, total } = await listSalesOrders(params);
  const meta = buildPageMeta(params, total);

  const canCreate = can(actor, "transaction:create");
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Sales Orders"
        description="Commitments to sell. A sales order becomes accounting when it is invoiced."
        action={canCreate ? { label: "New sales order", href: `${PATHNAME}/new` } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search by number, reference or customer..."
        filters={[
          {
            name: "status",
            label: "Status",
            options: SALES_ORDER_STATUS_OPTIONS.map((option) => ({ ...option })),
          },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No sales orders match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No sales orders yet"
              description="Create a sales order for a customer, confirm it, then generate the invoice."
              action={canCreate ? { label: "New sales order", href: `${PATHNAME}/new` } : undefined}
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
                  <TableHead>Customer</TableHead>
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
                    <TableCell>{order.customerName}</TableCell>
                    <TableCell className="text-muted-foreground tabular">
                      {order.orderDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <SalesOrderStatusBadge status={order.status} />
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
              itemLabel="sales orders"
            />
          </>
        )}
      </div>
    </div>
  );
}
