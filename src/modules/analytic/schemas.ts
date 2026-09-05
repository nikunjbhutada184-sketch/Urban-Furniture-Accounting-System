import { AnalyticAccountType } from "@prisma/client";
import { z } from "zod";
import { requiredText } from "@/modules/shared/zod-helpers";

export const ANALYTIC_TYPE_OPTIONS = [
  { value: AnalyticAccountType.INCOME, label: "Income" },
  { value: AnalyticAccountType.EXPENSE, label: "Expenses" },
] as const;

export const ANALYTIC_TYPE_LABELS: Record<AnalyticAccountType, string> = {
  [AnalyticAccountType.INCOME]: "Income",
  [AnalyticAccountType.EXPENSE]: "Expenses",
};

export const ANALYTIC_SORT_FIELDS = ["code", "name", "type", "createdAt"] as const;
export type AnalyticSortField = (typeof ANALYTIC_SORT_FIELDS)[number];

/**
 * An analytic account marks income or expense as belonging to a project,
 * department or business unit. It is the dimension budgets are measured
 * against, and is independent of the Chart of Accounts.
 */
export const analyticInputSchema = z.object({
  code: requiredText("Code", 24).refine((value) => /^[A-Za-z0-9._-]+$/.test(value), {
    message: "Code may only contain letters, numbers, dots, dashes and underscores.",
  }),
  name: requiredText("Analytic account name", 160),
  type: z.nativeEnum(AnalyticAccountType, {
    errorMap: () => ({ message: "Select income or expenses." }),
  }),
});

export type AnalyticInput = z.infer<typeof analyticInputSchema>;
