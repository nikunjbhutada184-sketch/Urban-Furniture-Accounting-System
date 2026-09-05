import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { listAnalyticOptions } from "@/modules/analytic/analytic-service";
import { createBudgetAction } from "@/modules/budgets/actions";
import { BudgetForm } from "@/modules/budgets/components/budget-form";
import { listBudgetOwners } from "@/modules/budgets/budget-queries";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New budget" };

export default async function NewBudgetPage() {
  await requirePermissionOrRedirect("budget:manage");

  const [analyticAccounts, users] = await Promise.all([
    listAnalyticOptions(),
    listBudgetOwners(),
  ]);

  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="New budget"
        description="Plan amounts against analytic accounts for a period."
      />

      <BudgetForm
        action={createBudgetAction}
        analyticAccounts={analyticAccounts.map((analytic) => ({
          id: analytic.id,
          code: analytic.code,
          name: analytic.name,
          type: analytic.type,
        }))}
        users={users}
        initialValues={{
          periodStart: monthStart.toISOString().slice(0, 10),
          periodEnd: monthEnd.toISOString().slice(0, 10),
        }}
        submitLabel="Create budget"
        cancelHref="/budgets"
        successHref="/budgets"
      />
    </div>
  );
}
