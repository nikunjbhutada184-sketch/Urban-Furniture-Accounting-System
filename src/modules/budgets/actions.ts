"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import {
  cancelBudget,
  confirmBudget,
  createBudget,
  recomputeBudgetProgress,
  reviseBudget,
  updateBudget,
} from "./budget-service";
import { budgetInputSchema, budgetRevisionSchema } from "./schemas";

/**
 * Budget server actions.
 *
 * Every one authorises, validates and runs inside a transaction through the
 * shared pipeline. The status rules live in the service: the UI disables the
 * buttons it should, and the service refuses regardless.
 */

export async function createBudgetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "budget:manage",
    schema: budgetInputSchema,
    formData,
    handler: (tx, input, actor) => createBudget(tx, input, { userId: actor.id }),
    successMessage: "Budget created.",
    revalidate: ["/budgets"],
  });
}

export async function updateBudgetAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "budget:manage",
    schema: budgetInputSchema,
    formData,
    handler: (tx, input, actor) => updateBudget(tx, id, input, { userId: actor.id }),
    successMessage: "Budget updated.",
    revalidate: ["/budgets", `/budgets/${id}`],
  });
}

export async function confirmBudgetAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "budget:manage",
    handler: (tx, actor) => confirmBudget(tx, id, { userId: actor.id }),
    successMessage: "Budget confirmed.",
    revalidate: ["/budgets", `/budgets/${id}`],
  });
}

export async function cancelBudgetAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "budget:manage",
    handler: (tx, actor) => cancelBudget(tx, id, { userId: actor.id }),
    successMessage: "Budget cancelled.",
    revalidate: ["/budgets", `/budgets/${id}`],
  });
}

/** Creates the next revision and marks the original REVISED. */
export async function reviseBudgetAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "budget:manage",
    schema: budgetRevisionSchema,
    formData,
    handler: (tx, input, actor) => reviseBudget(tx, id, input.lines, { userId: actor.id }),
    successMessage: "Revision created.",
    revalidate: ["/budgets", `/budgets/${id}`],
  });
}

/** Recomputes committed and achieved from the ledger and confirmed orders. */
export async function refreshBudgetProgressAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "budget:view",
    handler: async (tx) => {
      await recomputeBudgetProgress(tx, id);
    },
    successMessage: "Budget figures refreshed from the ledger.",
    revalidate: [`/budgets/${id}`],
  });
}
