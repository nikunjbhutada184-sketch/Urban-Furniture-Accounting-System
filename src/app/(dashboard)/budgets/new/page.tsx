import { prisma } from "@/server/db/prisma";
import { BudgetForm } from "./budget-form";

export default async function NewBudgetPage() {
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

  return (
    <div className="space-y-6">
      <BudgetForm users={users} analyticAccounts={analyticAccounts} />
    </div>
  );
}
