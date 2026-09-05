import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { listAnalyticOptions } from "@/modules/analytic/analytic-service";
import { updateBudgetAction } from "@/modules/budgets/actions";
import { listBudgetOwners } from "@/modules/budgets/budget-queries";
import { budgetPermissions, getBudget } from "@/modules/budgets/budget-service";
import { BudgetForm } from "@/modules/budgets/components/budget-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit budget" };

export default async function EditBudgetPage({
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

  // Only a draft is editable; the service enforces this too.
  if (!budgetPermissions(budget.status).canEdit) redirect(`/budgets/${id}`);

  const [analyticAccounts, users] = await Promise.all([
    listAnalyticOptions(),
    listBudgetOwners(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={`Edit ${budget.name}`} description="Only draft budgets can be edited." />

      <BudgetForm
        action={updateBudgetAction.bind(null, id)}
        analyticAccounts={analyticAccounts.map((analytic) => ({
          id: analytic.id,
          code: analytic.code,
          name: analytic.name,
          type: analytic.type,
        }))}
        users={users}
        initialValues={{
          name: budget.name,
          periodStart: budget.periodStart.toISOString().slice(0, 10),
          periodEnd: budget.periodEnd.toISOString().slice(0, 10),
          responsibleUserId: budget.responsibleUserId ?? "none",
          lines: budget.lines.map((line, index) => ({
            key: `existing-${index}`,
            analyticAccountId: line.analyticAccountId,
            plannedAmount: line.plannedAmount.toString(),
          })),
        }}
        submitLabel="Save changes"
        cancelHref={`/budgets/${id}`}
        successHref="/budgets"
      />
    </div>
  );
}
