import { BudgetStatus } from "@prisma/client";
import { z } from "zod";
import {
  dateString,
  decimalString,
  optionalId,
  requiredText,
} from "@/modules/shared/zod-helpers";

export const BUDGET_STATUS_OPTIONS = [
  { value: BudgetStatus.DRAFT, label: "Draft" },
  { value: BudgetStatus.CONFIRMED, label: "Confirmed" },
  { value: BudgetStatus.REVISED, label: "Revised" },
  { value: BudgetStatus.CANCELLED, label: "Cancelled" },
  { value: BudgetStatus.CLOSED, label: "Closed" },
] as const;

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  [BudgetStatus.DRAFT]: "Draft",
  [BudgetStatus.CONFIRMED]: "Confirmed",
  [BudgetStatus.REVISED]: "Revised",
  [BudgetStatus.CANCELLED]: "Cancelled",
  [BudgetStatus.CLOSED]: "Closed",
};

/**
 * One budget line: an analytic account and the amount planned against it.
 *
 * The line's `type` is not submitted -- it is taken from the analytic account,
 * so a line can never claim to be income while pointing at an expense account.
 */
export const budgetLineSchema = z.object({
  analyticAccountId: requiredText("Analytic account", 40),
  accountId: optionalId(),
  plannedAmount: decimalString("Planned amount", { scale: 2 }),
});

export type BudgetLineInput = z.infer<typeof budgetLineSchema>;

export const budgetInputSchema = z.object({
  name: requiredText("Budget name", 160),
  periodStart: dateString("Period start"),
  periodEnd: dateString("Period end"),
  responsibleUserId: optionalId(),
  // Lines ride along as JSON: a FormData cannot carry a nested array.
  lines: z.preprocess(
    (value) => (typeof value === "string" ? safeJsonParse(value) : value),
    z.array(budgetLineSchema).min(1, "Add at least one budget line."),
  ),
});

export type BudgetInput = z.infer<typeof budgetInputSchema>;

/** A revision keeps the original's period and responsible person; only lines change. */
export const budgetRevisionSchema = z.object({
  lines: z.preprocess(
    (value) => (typeof value === "string" ? safeJsonParse(value) : value),
    z.array(budgetLineSchema).min(1, "Add at least one budget line."),
  ),
});

export type BudgetRevisionInput = z.infer<typeof budgetRevisionSchema>;

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
