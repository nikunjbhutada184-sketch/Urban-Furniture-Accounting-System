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
import { BillStatusBadge } from "@/modules/purchases/components/status-badge";
import { INVOICE_STATUS_OPTIONS, VENDOR_BILL_SORT_FIELDS } from "@/modules/purchases/schemas";
import { listVendorBills } from "@/modules/purchases/vendor-bill-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Vendor Bills" };

const PATHNAME = "/purchases/bills";

export default async function VendorBillsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("transaction:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: VENDOR_BILL_SORT_FIELDS,
    defaultSort: "invoiceDate",
    defaultDirection: "desc",
    allowedFilters: {
      status: INVOICE_STATUS_OPTIONS.map((option) => option.value),
    },
  });

  const { rows, total } = await listVendorBills(params);
  const meta = buildPageMeta(params, total);
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Vendor Bills"
        description="What Urban Furniture owes its vendors. Posting a bill writes the ledger."
      />

      <ListToolbar
        searchPlaceholder="Search by number, vendor reference or vendor..."
        filters={[
          {
            name: "status",
            label: "Status",
            options: INVOICE_STATUS_OPTIONS.map((option) => ({ ...option })),
          },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No bills match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No vendor bills yet"
              description="Bills are created by converting a confirmed purchase order once the goods have been received."
              action={{ label: "Go to purchase orders", href: "/purchases/orders" }}
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
                    field="invoiceDate"
                    label="Invoice date"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="dueDate"
                    label="Due"
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
                  <SortableHeader
                    field="amountResidual"
                    label="Outstanding"
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
                {rows.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-medium">
                      <Link href={`${PATHNAME}/${bill.id}`} className="hover:underline">
                        {bill.number}
                      </Link>
                      {bill.purchaseOrderNumber ? (
                        <div className="text-muted-foreground text-xs">
                          from {bill.purchaseOrderNumber}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{bill.vendorName}</TableCell>
                    <TableCell className="text-muted-foreground tabular">
                      {bill.invoiceDate.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular">
                      {bill.dueDate?.toISOString().slice(0, 10) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <BillStatusBadge status={bill.status} />
                    </TableCell>
                    <TableCell className="tabular text-right">{bill.amountTotal}</TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {bill.amountResidual}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`${PATHNAME}/${bill.id}`}>View</Link>
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
              itemLabel="bills"
            />
          </>
        )}
      </div>
    </div>
  );
}
