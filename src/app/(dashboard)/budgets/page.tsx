import { type BudgetStatus } from "@prisma/client";
import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { ViewToggle, parseViewMode } from "@/components/data-table/view-toggle";
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
import { BudgetKanban } from "@/modules/budgets/components/budget-kanban";
import { BudgetPie } from "@/modules/budgets/components/budget-pie";
import { BudgetStatusBadge } from "@/modules/budgets/components/budget-status-badge";
import { BUDGET_STATUS_OPTIONS } from "@/modules/budgets/schemas";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Budgets" };

const PATHNAME = "/budgets";

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
  const view = parseViewMode(resolved);

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
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/reports/budget">Budget report</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
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
        </div>

        <ViewToggle pathname={PATHNAME} searchParams={resolved} current={view} />
      </div>

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
        ) : view === "kanban" ? (
          <BudgetKanban rows={rows} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Responsible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Achieved</TableHead>
                <TableHead className="text-right">Achieved %</TableHead>
                <TableHead className="text-center">Pie Chart</TableHead>
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
                    {budget.periodStart.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular text-xs">
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
                  <TableCell>
                    <div className="flex justify-center">
                      <BudgetPie achieved={budget.achieved} toAchieve={budget.toAchieve} />
                    </div>
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

      {rows.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          The donut splits planned into achieved (green) and the balance still to achieve (orange).
          Both figures are recomputed from the posted ledger — neither is stored as an editable
          value.
        </p>
      ) : null}
    </div>
  );
}
