"use server";

import { requireUser } from "@/modules/auth/session";
import { prisma } from "@/server/db/prisma";
import { runAction } from "@/modules/shared/run-action";
import { 
  createBudget, 
  confirmBudget, 
  reviseBudget, 
  cancelBudget, 
  syncBudgetAchievement 
} from "./budget-service";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const budgetLineSchema = z.object({
  analyticAccountId: z.string().min(1),
  accountId: z.string().optional().nullable(),
  plannedAmount: z.number().min(0),
});

const createBudgetSchema = z.object({
  name: z.string().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  responsibleUserId: z.string().optional().nullable(),
  lines: z.array(budgetLineSchema).min(1),
});

export const createBudgetAction = runAction(
  createBudgetSchema,
  async (data) => {
    await requireUser();
    
    // Ensure nullable fields are undefined for Prisma if they are null
    const mappedLines = data.lines.map(l => ({
      analyticAccountId: l.analyticAccountId,
      accountId: l.accountId || undefined,
      plannedAmount: l.plannedAmount
    }));

    const budget = await createBudget(prisma, {
      ...data,
      responsibleUserId: data.responsibleUserId || undefined,
      lines: mappedLines,
    });
    
    revalidatePath("/budgets");
    return budget;
  }
);

export const confirmBudgetAction = runAction(
  z.object({ id: z.string().min(1) }),
  async ({ id }) => {
    await requireUser();
    await confirmBudget(prisma, id);
    revalidatePath("/budgets");
    revalidatePath(`/budgets/${id}`);
    return { success: true };
  }
);

export const cancelBudgetAction = runAction(
  z.object({ id: z.string().min(1) }),
  async ({ id }) => {
    await requireUser();
    await cancelBudget(prisma, id);
    revalidatePath("/budgets");
    revalidatePath(`/budgets/${id}`);
    return { success: true };
  }
);

export const reviseBudgetAction = runAction(
  z.object({ 
    id: z.string().min(1),
    lines: z.array(budgetLineSchema).min(1)
  }),
  async ({ id, lines }) => {
    await requireUser();
    
    const mappedLines = lines.map(l => ({
      analyticAccountId: l.analyticAccountId,
      accountId: l.accountId || undefined,
      plannedAmount: l.plannedAmount
    }));

    const newBudget = await reviseBudget(prisma, id, mappedLines);
    revalidatePath("/budgets");
    revalidatePath(`/budgets/${id}`);
    return newBudget;
  }
);

export const syncBudgetAction = runAction(
  z.object({ id: z.string().min(1) }),
  async ({ id }) => {
    await requireUser();
    await syncBudgetAchievement(prisma, id);
    revalidatePath(`/budgets/${id}`);
    return { success: true };
  }
);
