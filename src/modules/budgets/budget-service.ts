import { Prisma, BudgetStatus, AnalyticAccountType } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { type DbClient } from "@/server/db/prisma";

export async function createBudget(
  tx: DbClient,
  data: {
    name: string;
    periodStart: Date;
    periodEnd: Date;
    responsibleUserId?: string;
    lines: {
      analyticAccountId: string;
      accountId?: string;
      plannedAmount: number | Decimal;
    }[];
  }
) {
  // Get analytic account types to populate line types
  const analyticAccountIds = [...new Set(data.lines.map((l) => l.analyticAccountId))];
  const analyticAccounts = await tx.analyticAccount.findMany({
    where: { id: { in: analyticAccountIds } },
    select: { id: true, type: true },
  });
  
  const typeMap = new Map(analyticAccounts.map((a) => [a.id, a.type]));

  const budget = await tx.budget.create({
    data: {
      name: data.name,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: BudgetStatus.DRAFT,
      responsibleUserId: data.responsibleUserId,
      lines: {
        create: data.lines.map((l) => ({
          analyticAccountId: l.analyticAccountId,
          accountId: l.accountId,
          plannedAmount: new Decimal(l.plannedAmount),
          type: typeMap.get(l.analyticAccountId) || AnalyticAccountType.EXPENSE,
          committedAmount: new Decimal(0),
          achievedAmount: new Decimal(0),
        })),
      },
    },
    include: { lines: true },
  });

  return budget;
}

export async function confirmBudget(tx: DbClient, id: string) {
  const budget = await tx.budget.findUnique({ where: { id } });
  if (!budget) throw new Error("Budget not found");
  if (budget.status !== BudgetStatus.DRAFT) {
    throw new Error("Only draft budgets can be confirmed");
  }

  return tx.budget.update({
    where: { id },
    data: { status: BudgetStatus.CONFIRMED },
  });
}

export async function reviseBudget(
  tx: DbClient,
  id: string,
  newLines: {
    analyticAccountId: string;
    accountId?: string;
    plannedAmount: number | Decimal;
  }[]
) {
  const originalBudget = await tx.budget.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!originalBudget) throw new Error("Original budget not found");
  if (originalBudget.status !== BudgetStatus.CONFIRMED) {
    throw new Error("Only confirmed budgets can be revised");
  }

  // Update original to REVISED status
  await tx.budget.update({
    where: { id },
    data: { status: BudgetStatus.REVISED },
  });

  // Create new budget pointing to the original
  const newName = originalBudget.name.includes("Revised")
    ? originalBudget.name // Prevent "Revised Revised"
    : `${originalBudget.name} Revised`;

  return createBudget(tx, {
    name: newName,
    periodStart: originalBudget.periodStart,
    periodEnd: originalBudget.periodEnd,
    responsibleUserId: originalBudget.responsibleUserId || undefined,
    lines: newLines,
  }).then(async (newBudget) => {
    return tx.budget.update({
      where: { id: newBudget.id },
      data: { revisionOfId: originalBudget.id },
    });
  });
}

export async function cancelBudget(tx: DbClient, id: string) {
  return tx.budget.update({
    where: { id },
    data: { status: BudgetStatus.CANCELLED },
  });
}

export async function syncBudgetAchievement(tx: DbClient, id: string) {
  const budget = await tx.budget.findUnique({
    where: { id },
    include: { lines: true },
  });

  if (!budget || budget.status !== BudgetStatus.CONFIRMED) {
    return; // Only sync confirmed budgets
  }

  for (const line of budget.lines) {
    // Calculate achieved amount from posted JournalItems
    // For INCOME accounts: credit - debit
    // For EXPENSE accounts: debit - credit
    const items = await tx.journalItem.findMany({
      where: {
        analyticAccountId: line.analyticAccountId,
        accountId: line.accountId || undefined,
        status: "POSTED",
        date: {
          gte: budget.periodStart,
          lte: budget.periodEnd,
        },
      },
      select: { debit: true, credit: true },
    });

    let achieved = new Decimal(0);
    for (const item of items) {
      if (line.type === AnalyticAccountType.INCOME) {
        achieved = achieved.plus(item.credit).minus(item.debit);
      } else {
        achieved = achieved.plus(item.debit).minus(item.credit);
      }
    }

    await tx.budgetLine.update({
      where: { id: line.id },
      data: { achievedAmount: achieved },
    });
  }
}
