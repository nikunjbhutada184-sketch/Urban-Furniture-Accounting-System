import { type BudgetStatus } from "@prisma/client";
import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListToolbar } from "@/components/data-table/list-toolbar";
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
import { type RawSearchParams } from "@/lib/list-params";
import { listBudgets } from "@/modules/budgets/budget-service";
import { BudgetStatusBadge } from "@/modules/budgets/components/budget-status-badge";
import { BUDGET_STATUS_OPTIONS } from "@/modules/budgets/schemas";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Budgets" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("budget:view");
  const resolved = await searchParams;

  const statusFilter = first(resolved.status);
  const search = (first(resolved.q) ?? "").trim();

  const rows = await listBudgets({
    status: BUDGET_STATUS_OPTIONS.some((option) => option.value === statusFilter)
      ? (statusFilter as BudgetStatus)
      : undefined,
    search: search || undefined,
  });

  const canManage = can(actor, "budget:manage");
  const isFiltered = Boolean(search || statusFilter);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Budgets"
        description="Plan income and expenditure against analytic accounts, and track progress from the ledger."
        action={canManage ? { label: "New budget", href: "/budgets/new" } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search budgets by name..."
        filters={[
          {
            name: "status",
            label: "Status",
            options: BUDGET_STATUS_OPTIONS.map((option) => ({ ...option })),
          },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No budgets match your filters"
              description="Try a different search term, or clear the filters."
            />
          ) : (
            <EmptyState
              title="No budgets yet"
              description="Create a budget for a period, plan amounts against your analytic accounts, then confirm it to start tracking."
              action={canManage ? { label: "New budget", href: "/budgets/new" } : undefined}
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Achieved</TableHead>
                <TableHead className="text-right">Achieved %</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((budget) => (
                <TableRow key={budget.id}>
                  <TableCell className="font-medium">
                    <Link href={`/budgets/${budget.id}`} className="hover:underline">
                      {budget.name}
                    </Link>
                    {budget.revisionOfName ? (
                      <div className="text-muted-foreground text-xs">
                        revision of {budget.revisionOfName}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular text-xs">
                    {budget.periodStart.toISOString().slice(0, 10)} to{" "}
                    {budget.periodEnd.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {budget.responsibleName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <BudgetStatusBadge status={budget.status} />
                  </TableCell>
                  <TableCell className="tabular text-right">{budget.planned}</TableCell>
                  <TableCell className="tabular text-right">{budget.achieved}</TableCell>
                  <TableCell className="tabular text-right">
                    {budget.achievedPercent === null ? "—" : `${budget.achievedPercent}%`}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/budgets/${budget.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
