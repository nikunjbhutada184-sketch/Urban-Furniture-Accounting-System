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
  ENTRY_SORT_FIELDS,
  ENTRY_STATUS_OPTIONS,
  listJournalEntries,
} from "@/modules/journal-entries/entry-queries";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Journal Entries" };

const PATHNAME = "/journal-entries";

export default async function JournalEntriesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("transaction:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: ENTRY_SORT_FIELDS,
    defaultSort: "date",
    defaultDirection: "desc",
    allowedFilters: { status: ENTRY_STATUS_OPTIONS.map((option) => option.value) },
  });

  const { rows, total } = await listJournalEntries(params);
  const meta = buildPageMeta(params, total);
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Journal Entries"
        description="Every entry in the ledger. Posted entries are immutable — corrections are made by reversal."
        action={{ label: "General ledger", href: "/general-ledger" }}
      />

      <ListToolbar
        searchPlaceholder="Search by number, reference or description..."
        filters={[
          {
            name: "status",
            label: "Status",
            options: ENTRY_STATUS_OPTIONS.map((option) => ({ ...option })),
          },
        ]}
      />

      <div className="card-float rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No entries match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="Nothing posted yet"
              description="Journal entries are created when a vendor bill, customer invoice or payment is posted."
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
                    label="Entry"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="date"
                    label="Date"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead>Journal</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <SortableHeader
                    field="totalDebit"
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
                {rows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      <Link href={`${PATHNAME}/${entry.id}`} className="hover:underline">
                        {entry.number}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {entry.itemCount} lines
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular">
                      {entry.date.toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{entry.journalCode}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[18rem] truncate">
                      {entry.description ?? entry.reference ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.status === "POSTED"
                            ? "success"
                            : entry.status === "DRAFT"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {entry.status === "POSTED"
                          ? "Posted"
                          : entry.status === "DRAFT"
                            ? "Draft"
                            : "Cancelled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={entry.total} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`${PATHNAME}/${entry.id}`}>View</Link>
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
              itemLabel="entries"
            />
          </>
        )}
      </div>
    </div>
  );
}
