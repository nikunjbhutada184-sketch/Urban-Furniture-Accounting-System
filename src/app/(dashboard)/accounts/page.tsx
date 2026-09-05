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
import { listAccounts } from "@/modules/accounts/account-service";
import { archiveAccountAction } from "@/modules/accounts/actions";
import {
  ACCOUNT_SORT_FIELDS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_OPTIONS,
  ACCOUNT_TYPE_STATEMENT,
} from "@/modules/accounts/schemas";
import { ARCHIVE_FILTER_OPTIONS, ARCHIVE_STATUS_VALUES } from "@/modules/shared/list-filters";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Chart of Accounts" };

const PATHNAME = "/accounts";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("master:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: ACCOUNT_SORT_FIELDS,
    defaultSort: "code",
    allowedFilters: {
      type: ACCOUNT_TYPE_OPTIONS.map((option) => option.value),
      status: ARCHIVE_STATUS_VALUES,
    },
  });

  const { rows, total } = await listAccounts(params);
  const meta = buildPageMeta(params, total);

  const canCreate = can(actor, "master:create");
  const canUpdate = can(actor, "master:update");
  const canArchive = can(actor, "master:archive");
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Chart of Accounts"
        description="Every ledger account transactions are classified into."
        action={canCreate ? { label: "New account", href: "/accounts/new" } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search by code or name..."
        filters={[
          {
            name: "type",
            label: "Type",
            options: ACCOUNT_TYPE_OPTIONS.map((option) => ({ ...option })),
          },
          { name: "status", label: "Status", options: ARCHIVE_FILTER_OPTIONS },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No accounts match your filters"
              description="Try a different search term, or clear the filters to see the whole chart."
            />
          ) : (
            <EmptyState
              title="No accounts yet"
              description="Seed the standard chart of accounts, or add Cash, Bank, Debtors, Creditors, Sales Income and Purchases Expense by hand."
              action={canCreate ? { label: "New account", href: "/accounts/new" } : undefined}
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
                    label="Account"
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
                  <TableHead>Parent</TableHead>
                  <TableHead className="text-right">Journal items</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((account) => (
                  <TableRow key={account.id} className={account.isArchived ? "opacity-60" : ""}>
                    <TableCell className="tabular font-medium">{account.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{account.name}</span>
                        {account.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
                        {account.isReconcilable ? (
                          <Badge variant="outline">Reconcilable</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <Badge variant="secondary" className="w-fit">
                          {ACCOUNT_TYPE_LABELS[account.type]}
                        </Badge>
                        <span className="text-muted-foreground mt-0.5 text-[11px]">
                          {ACCOUNT_TYPE_STATEMENT[account.type]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.parentLabel ?? "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">{account.itemCount}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/accounts/${account.id}/edit`}>
                              <Pencil aria-hidden />
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                        {canArchive ? (
                          <ArchiveDialog
                            action={archiveAccountAction.bind(
                              null,
                              account.id,
                              !account.isArchived,
                            )}
                            recordName={`${account.code} ${account.name}`}
                            entityLabel="Account"
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
              itemLabel="accounts"
            />
          </>
        )}
      </div>
    </div>
  );
}
