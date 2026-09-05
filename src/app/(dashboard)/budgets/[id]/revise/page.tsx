import { prisma } from "@/server/db/prisma";
import { notFound, redirect } from "next/navigation";
import { BudgetForm } from "../../new/budget-form";
import { BudgetStatus } from "@prisma/client";

export default async function ReviseBudgetPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const budget = await prisma.budget.findUnique({
    where: { id: params.id },
    include: {
      lines: true
    }
  });

  if (!budget) notFound();
  
  if (budget.status !== BudgetStatus.CONFIRMED) {
    // Only confirmed budgets can be revised. Redirect to detail page.
    redirect(`/budgets/${budget.id}`);
  }

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });

  const analyticAccounts = await prisma.analyticAccount.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" }
  });

  const initialData = {
    name: budget.name,
    periodStart: budget.periodStart,
    periodEnd: budget.periodEnd,
    responsibleUserId: budget.responsibleUserId,
    lines: budget.lines.map(l => ({
      analyticAccountId: l.analyticAccountId,
      plannedAmount: l.plannedAmount.toNumber()
    })),
    isRevision: true,
    budgetId: budget.id
  };

  return (
    <div className="space-y-6">
      <BudgetForm 
        users={users} 
        analyticAccounts={analyticAccounts} 
        initialData={initialData} 
      />
    </div>
  );
}
