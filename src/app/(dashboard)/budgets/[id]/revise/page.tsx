import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { listAnalyticOptions } from "@/modules/analytic/analytic-service";
import { reviseBudgetAction } from "@/modules/budgets/actions";
import { listBudgetOwners } from "@/modules/budgets/budget-queries";
import { budgetPermissions, getBudget } from "@/modules/budgets/budget-service";
import { BudgetForm } from "@/modules/budgets/components/budget-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Revise budget" };

export default async function ReviseBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionOrRedirect("budget:manage");
  const { id } = await params;

  const budget = await getBudget(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  // Only a confirmed budget can be revised; the service enforces this too.
  if (!budgetPermissions(budget.status).canRevise) redirect(`/budgets/${id}`);

  const [analyticAccounts, users] = await Promise.all([
    listAnalyticOptions(),
    listBudgetOwners(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={`Revise ${budget.name}`}
        description="Creates a new draft revision. The current version is kept and marked Revised."
      />

      <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
        The period ({budget.periodStart.toISOString().slice(0, 10)} to{" "}
        {budget.periodEnd.toISOString().slice(0, 10)}) and responsible person carry over from the
        original. Adjust the planned amounts below.
      </p>

      <BudgetForm
        action={reviseBudgetAction.bind(null, id)}
        analyticAccounts={analyticAccounts.map((analytic) => ({
          id: analytic.id,
          code: analytic.code,
          name: analytic.name,
          type: analytic.type,
        }))}
        users={users}
        lockHeader
        initialValues={{
          lines: budget.lines.map((line, index) => ({
            key: `existing-${index}`,
            analyticAccountId: line.analyticAccountId,
            plannedAmount: line.plannedAmount.toString(),
          })),
        }}
        submitLabel="Create revision"
        cancelHref={`/budgets/${id}`}
        successHref="/budgets"
      />
    </div>
  );
}
