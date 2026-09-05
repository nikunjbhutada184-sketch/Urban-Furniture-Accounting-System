import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { SortableHeader } from "@/components/data-table/sortable-header";
import { PageHeader } from "@/components/page-header";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams, buildPageMeta, parseListParams } from "@/lib/list-params";
import {
  PAYMENT_DIRECTION_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_SORT_FIELDS,
  listPayments,
} from "@/modules/payments/payment-queries";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Payments" };

const PATHNAME = "/payments";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("payment:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: PAYMENT_SORT_FIELDS,
    defaultSort: "paymentDate",
    defaultDirection: "desc",
    allowedFilters: {
      direction: PAYMENT_DIRECTION_OPTIONS.map((option) => option.value),
      method: PAYMENT_METHOD_OPTIONS.map((option) => option.value),
    },
  });

  const { rows, total } = await listPayments(params);
  const meta = buildPageMeta(params, total);
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  const received = rows
    .filter((row) => row.direction === "INBOUND")
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const paid = rows
    .filter((row) => row.direction === "OUTBOUND")
    .reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Payments"
        description="Money received from customers and paid to vendors. Every payment posts its own journal entry."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Received (this page)" value={received.toFixed(2)} tone="primary" />
        <StatCard label="Paid (this page)" value={paid.toFixed(2)} />
        <StatCard label="Payments" value={String(total)} hint="Matching the current filters" />
      </div>

      <ListToolbar
        searchPlaceholder="Search by number, reference or contact..."
        filters={[
          {
            name: "direction",
            label: "Direction",
            options: PAYMENT_DIRECTION_OPTIONS.map((option) => ({ ...option })),
          },
          {
            name: "method",
            label: "Method",
            options: PAYMENT_METHOD_OPTIONS.map((option) => ({ ...option })),
          },
        ]}
      />

      <div className="card-float rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No payments match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No payments yet"
              description="Payments are registered from a posted vendor bill or customer invoice."
              action={{ label: "Customer invoices", href: "/sales/invoices" }}
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    field="number"
                    label="Payment"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="paymentDate"
                    label="Date"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead>Contact</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Settles</TableHead>
                  <SortableHeader
                    field="amount"
                    label="Amount"
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
                {rows.map((payment) => {
                  const inbound = payment.direction === "INBOUND";

                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {inbound ? (
                            <ArrowDownLeft className="text-primary size-4" aria-hidden />
                          ) : (
                            <ArrowUpRight className="text-muted-foreground size-4" aria-hidden />
                          )}
                          <Link href={`${PATHNAME}/${payment.id}`} className="hover:underline">
                            {payment.number}
                          </Link>
                        </div>
                        <div className="text-muted-foreground pl-6 text-xs">
                          {inbound ? "Received" : "Paid"}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular">
                        {payment.paymentDate.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell>{payment.contactName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{payment.method}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {payment.allocationCount} document
                        {payment.allocationCount === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={payment.amount} size="sm" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`${PATHNAME}/${payment.id}`}>View</Link>
                        </Button>
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
              itemLabel="payments"
            />
          </>
        )}
      </div>
    </div>
  );
}
