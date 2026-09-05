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
import { archiveAnalyticAction } from "@/modules/analytic/actions";
import { listAnalyticAccounts } from "@/modules/analytic/analytic-service";
import {
  ANALYTIC_SORT_FIELDS,
  ANALYTIC_TYPE_LABELS,
  ANALYTIC_TYPE_OPTIONS,
} from "@/modules/analytic/schemas";
import { ARCHIVE_FILTER_OPTIONS, ARCHIVE_STATUS_VALUES } from "@/modules/shared/list-filters";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Analytic Accounts" };

const PATHNAME = "/analytic";

export default async function AnalyticPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("master:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: ANALYTIC_SORT_FIELDS,
    defaultSort: "code",
    allowedFilters: {
      type: ANALYTIC_TYPE_OPTIONS.map((option) => option.value),
      status: ARCHIVE_STATUS_VALUES,
    },
  });

  const { rows, total } = await listAnalyticAccounts(params);
  const meta = buildPageMeta(params, total);

  const canCreate = can(actor, "master:create");
  const canUpdate = can(actor, "master:update");
  const canArchive = can(actor, "master:archive");
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Analytic Accounts"
        description="Track income and expenses by project, department or business unit."
        action={canCreate ? { label: "New analytic account", href: "/analytic/new" } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search by code or name..."
        filters={[
          {
            name: "type",
            label: "Type",
            options: ANALYTIC_TYPE_OPTIONS.map((option) => ({ ...option })),
          },
          { name: "status", label: "Status", options: ARCHIVE_FILTER_OPTIONS },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No analytic accounts match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No analytic accounts yet"
              description="Add the projects, departments or business units you want to measure budgets against."
              action={
                canCreate ? { label: "New analytic account", href: "/analytic/new" } : undefined
              }
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
                    label="Analytic account"
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
                  <TableHead className="text-right">Journal items</TableHead>
                  <TableHead className="text-right">Budget lines</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((account) => (
                  <TableRow key={account.id} className={account.isArchived ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{account.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{account.name}</span>
                        {account.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={account.type === "INCOME" ? "success" : "secondary"}>
                        {ANALYTIC_TYPE_LABELS[account.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular text-right">{account.itemCount}</TableCell>
                    <TableCell className="tabular text-right">{account.budgetLineCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/analytic/${account.id}/edit`}>
                              <Pencil aria-hidden />
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                        {canArchive ? (
                          <ArchiveDialog
                            action={archiveAnalyticAction.bind(
                              null,
                              account.id,
                              !account.isArchived,
                            )}
                            recordName={account.name}
                            entityLabel="Analytic account"
                            isArchived={account.isArchived}
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
              itemLabel="analytic accounts"
            />
          </>
        )}
      </div>
    </div>
  );
}
