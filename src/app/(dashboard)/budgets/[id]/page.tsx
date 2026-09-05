import { Info } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelBudgetAction,
  confirmBudgetAction,
  refreshBudgetProgressAction,
} from "@/modules/budgets/actions";
import {
  budgetPermissions,
  getBudget,
  getRevisionHistory,
  toBudgetLineRows,
} from "@/modules/budgets/budget-service";
import {
  BudgetStatusBadge,
  budgetStatusHint,
} from "@/modules/budgets/components/budget-status-badge";
import { DocumentActionButton } from "@/modules/shared/components/document-action-button";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Budget" };

function sumColumn(rows: { planned: string; committed: string; achieved: string }[]) {
  return rows.reduce(
    (totals, row) => ({
      planned: totals.planned + Number(row.planned),
      committed: totals.committed + Number(row.committed),
      achieved: totals.achieved + Number(row.achieved),
    }),
    { planned: 0, committed: 0, achieved: 0 },
  );
}

function money(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermissionOrRedirect("budget:view");
  const { id } = await params;

  const budget = await getBudget(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const [history] = await Promise.all([getRevisionHistory(id)]);

  const lines = toBudgetLineRows(budget.lines);
  const permissions = budgetPermissions(budget.status);
  const canManage = can(actor, "budget:manage");

  const totals = sumColumn(lines);
  const toAchieve = Math.max(totals.planned - totals.achieved, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={budget.name}
        description={`${budget.periodStart.toISOString().slice(0, 10)} to ${budget.periodEnd.toISOString().slice(0, 10)}`}
      >
        <BudgetStatusBadge status={budget.status} />
      </PageHeader>

      {/* What the current status allows, stated plainly. */}
      <div className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{budgetStatusHint(budget.status)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <>
            {permissions.canEdit ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/budgets/${budget.id}/edit`}>Edit</Link>
              </Button>
            ) : null}

            {permissions.canConfirm ? (
              <DocumentActionButton
                action={confirmBudgetAction.bind(null, budget.id)}
                label="Confirm"
                title="Confirm this budget?"
                description="Confirming locks the planned figures. From then on the budget can only be changed by creating a revision, which preserves this version."
                confirmLabel="Confirm budget"
              />
            ) : (
              <Button variant="outline" size="sm" disabled title="Only a draft budget can be confirmed">
                Confirm
              </Button>
            )}

            {permissions.canRevise ? (
              <Button size="sm" asChild>
                <Link href={`/budgets/${budget.id}/revise`}>Revise</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled title="Only a confirmed budget can be revised">
                Revise
              </Button>
            )}

            {permissions.canCancel ? (
              <DocumentActionButton
                action={cancelBudgetAction.bind(null, budget.id)}
                label="Cancel"
                title="Cancel this budget?"
                description="The budget becomes read-only and stops being tracked. This cannot be undone."
                variant="outline"
              />
            ) : (
              <Button variant="outline" size="sm" disabled title="This budget can no longer be cancelled">
                Cancel
              </Button>
            )}
          </>
        ) : null}

        <DocumentActionButton
          action={refreshBudgetProgressAction.bind(null, budget.id)}
          label="Refresh figures"
          title="Recompute from the ledger?"
          description="Recalculates committed and achieved amounts from confirmed orders and posted journal entries. Planned amounts are not touched."
          confirmLabel="Refresh"
          variant="ghost"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Responsible person", value: budget.responsibleUser?.name ?? "—" },
          { label: "Planned", value: money(totals.planned) },
          { label: "Achieved", value: money(totals.achieved) },
          { label: "To achieve", value: money(toAchieve) },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="tabular text-sm font-medium">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Budget lines</CardTitle>
          <CardDescription>
            Planned is what you entered. Committed comes from confirmed orders not yet posted;
            achieved comes from posted journal entries. Click an achieved amount to see the
            entries behind it.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Analytic</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Committed Amount</TableHead>
                <TableHead className="text-right">Achieved Amount</TableHead>
                <TableHead className="text-right">Achieved %</TableHead>
                <TableHead className="text-right">Amount To Achieve</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <div className="font-medium">{line.analyticName}</div>
                    <div className="text-muted-foreground text-xs">{line.analyticCode}</div>
                    {line.accountLabel ? (
                      <div className="text-muted-foreground text-xs">{line.accountLabel}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={line.type === "INCOME" ? "success" : "secondary"}>
                      {line.type === "INCOME" ? "Income" : "Expenses"}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-right">{line.planned}</TableCell>
                  <TableCell className="tabular text-right">{line.committed}</TableCell>
                  <TableCell className="tabular text-right">
                    <Link
                      href={`/budgets/${budget.id}/lines/${line.id}`}
                      className="font-medium underline underline-offset-2"
                    >
                      {line.achieved}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {line.achievedPercent === null ? "—" : `${line.achievedPercent}%`}
                  </TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {line.toAchieve}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="tabular text-right">{money(totals.planned)}</TableCell>
                <TableCell className="tabular text-right">{money(totals.committed)}</TableCell>
                <TableCell className="tabular text-right">{money(totals.achieved)}</TableCell>
                <TableCell className="tabular text-right">
                  {totals.planned === 0
                    ? "—"
                    : `${((totals.achieved / totals.planned) * 100).toFixed(1)}%`}
                </TableCell>
                <TableCell className="tabular text-right">{money(toAchieve)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {history.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revision history</CardTitle>
            <CardDescription>
              Budgets are revised rather than edited, so every version is preserved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((revision, index) => (
              <div
                key={revision.id}
                className={
                  revision.id === budget.id
                    ? "bg-muted/60 flex items-center justify-between rounded-md border px-3 py-2"
                    : "flex items-center justify-between rounded-md px-3 py-2"
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">#{index + 1}</span>
                  {revision.id === budget.id ? (
                    <span className="text-sm font-medium">{revision.name} (viewing)</span>
                  ) : (
                    <Link href={`/budgets/${revision.id}`} className="text-sm hover:underline">
                      {revision.name}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground tabular text-xs">
                    {revision.createdAt.toISOString().slice(0, 10)}
                  </span>
                  <BudgetStatusBadge status={revision.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
