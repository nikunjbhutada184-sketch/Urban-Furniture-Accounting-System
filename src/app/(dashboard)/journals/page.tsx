import { Pencil } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { ArchiveDialog } from "@/components/data-table/archive-dialog";
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
import { archiveJournalAction } from "@/modules/journals/actions";
import { listJournals } from "@/modules/journals/journal-service";
import {
  JOURNAL_SORT_FIELDS,
  JOURNAL_TYPE_LABELS,
  JOURNAL_TYPE_OPTIONS,
} from "@/modules/journals/schemas";
import { ARCHIVE_FILTER_OPTIONS, ARCHIVE_STATUS_VALUES } from "@/modules/shared/list-filters";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Journals" };

const PATHNAME = "/journals";

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("master:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: JOURNAL_SORT_FIELDS,
    defaultSort: "code",
    allowedFilters: {
      type: JOURNAL_TYPE_OPTIONS.map((option) => option.value),
      status: ARCHIVE_STATUS_VALUES,
    },
  });

  const { rows, total } = await listJournals(params);
  const meta = buildPageMeta(params, total);

  const canCreate = can(actor, "master:create");
  const canUpdate = can(actor, "master:update");
  const canArchive = can(actor, "master:archive");
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Journals"
        description="Groups of similar transactions, and the default accounts they post to."
        action={canCreate ? { label: "New journal", href: "/journals/new" } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search by code or name..."
        filters={[
          {
            name: "type",
            label: "Type",
            options: JOURNAL_TYPE_OPTIONS.map((option) => ({ ...option })),
          },
          { name: "status", label: "Status", options: ARCHIVE_FILTER_OPTIONS },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No journals match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No journals yet"
              description="Add the Sales, Purchase, Bank and Cash journals your transactions post through."
              action={canCreate ? { label: "New journal", href: "/journals/new" } : undefined}
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    field="code"
                    label="Code"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="name"
                    label="Journal"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="type"
                    label="Type"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead>Default accounts</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((journal) => (
                  <TableRow key={journal.id} className={journal.isArchived ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{journal.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{journal.name}</span>
                        {journal.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{JOURNAL_TYPE_LABELS[journal.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {journal.paymentAccountLabel ? (
                        <div>Payment: {journal.paymentAccountLabel}</div>
                      ) : null}
                      {journal.defaultDebitLabel ? (
                        <div>Dr: {journal.defaultDebitLabel}</div>
                      ) : null}
                      {journal.defaultCreditLabel ? (
                        <div>Cr: {journal.defaultCreditLabel}</div>
                      ) : null}
                      {!journal.paymentAccountLabel &&
                      !journal.defaultDebitLabel &&
                      !journal.defaultCreditLabel
                        ? "—"
                        : null}
                    </TableCell>
                    <TableCell className="tabular text-right">{journal.entryCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/journals/${journal.id}/edit`}>
                              <Pencil aria-hidden />
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                        {canArchive ? (
                          <ArchiveDialog
                            action={archiveJournalAction.bind(
                              null,
                              journal.id,
                              !journal.isArchived,
                            )}
                            recordName={journal.name}
                            entityLabel="Journal"
                            isArchived={journal.isArchived}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <ListPagination
              meta={meta}
              pathname={PATHNAME}
              searchParams={resolved}
              itemLabel="journals"
            />
          </>
        )}
      </div>
    </div>
  );
}
