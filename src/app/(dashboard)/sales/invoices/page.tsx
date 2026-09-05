import { InvoiceStatus, JournalType } from "@prisma/client";
import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { listJournalOptions } from "@/modules/journals/journal-service";
import { INVOICE_STATUS_OPTIONS } from "@/modules/purchases/schemas";
import { receiveInvoicePaymentAction } from "@/modules/sales/actions";
import { listCustomerInvoices } from "@/modules/sales/customer-invoice-service";
import { CUSTOMER_INVOICE_SORT_FIELDS } from "@/modules/sales/schemas";
import { PaymentDialog } from "@/modules/shared/components/payment-dialog";
import { InvoiceStatusBadge } from "@/modules/shared/components/status-badge";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Customer Invoices" };

const PATHNAME = "/sales/invoices";

export default async function CustomerInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: CUSTOMER_INVOICE_SORT_FIELDS,
    defaultSort: "invoiceDate",
    defaultDirection: "desc",
    allowedFilters: { status: INVOICE_STATUS_OPTIONS.map((option) => option.value) },
  });

  const { rows, total } = await listCustomerInvoices(params);

  // Loaded once for the whole page rather than per row: the Pay dialog needs
  // the cash and bank journals, and they are the same for every invoice.
  const canPay = can(actor, "payment:post");
  const paymentJournals = canPay
    ? await listJournalOptions([JournalType.BANK, JournalType.CASH])
    : [];
  const journalOptions = paymentJournals.map((journal) => ({
    id: journal.id,
    label: `${journal.code} · ${journal.name}`,
    method: (journal.type === JournalType.CASH ? "CASH" : "BANK") as "CASH" | "BANK",
  }));
  const meta = buildPageMeta(params, total);
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  const today = new Date();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Customer Invoices"
        description="What customers owe Urban Furniture. Posting an invoice writes the ledger."
        action={{ label: "Customer outstanding", href: "/sales/outstanding" }}
      />

      <ListToolbar
        searchPlaceholder="Search by number, reference or customer..."
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
              title="No invoices match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No customer invoices yet"
              description="Invoices are generated from a confirmed sales order."
              action={{ label: "Go to sales orders", href: "/sales/orders" }}
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
                {rows.map((invoice) => {
                  const isCollectable =
                    invoice.status === InvoiceStatus.POSTED ||
                    invoice.status === InvoiceStatus.PARTIALLY_PAID;

                  const isOverdue =
                    invoice.dueDate !== null &&
                    invoice.dueDate.getTime() < today.getTime() &&
                    Number(invoice.amountResidual) > 0;

                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        <Link href={`${PATHNAME}/${invoice.id}`} className="hover:underline">
                          {invoice.number}
                        </Link>
                        {invoice.salesOrderNumber ? (
                          <div className="text-muted-foreground text-xs">
                            from {invoice.salesOrderNumber}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{invoice.customerName}</TableCell>
                      <TableCell className="text-muted-foreground tabular">
                        {invoice.invoiceDate.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell className="tabular">
                        <span className={isOverdue ? "text-destructive" : "text-muted-foreground"}>
                          {invoice.dueDate?.toISOString().slice(0, 10) ?? "—"}
                        </span>
                        {isOverdue ? (
                          <Badge variant="destructive" className="ml-2">
                            Overdue
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">{invoice.amountTotal}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {invoice.amountResidual}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {canPay && isCollectable ? (
                            <PaymentDialog
                              action={receiveInvoicePaymentAction.bind(null, invoice.id)}
                              documentNumber={invoice.number}
                              partnerName={invoice.customerName}
                              direction="receive"
                              amountResidual={invoice.amountResidual}
                              triggerLabel="Pay"
                              title="Invoice Payment"
                              currencyNote="Records money received"
                              journals={journalOptions}
                            />
                          ) : null}

                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`${PATHNAME}/${invoice.id}`}>View</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <ListPagination
              meta={meta}
              pathname={PATHNAME}
              searchParams={resolved}
              itemLabel="invoices"
            />
          </>
        )}
      </div>
    </div>
  );
}
