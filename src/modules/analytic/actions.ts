"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import {
  createAnalyticAccount,
  setAnalyticArchived,
  updateAnalyticAccount,
} from "./analytic-service";
import { analyticInputSchema } from "./schemas";

export async function createAnalyticAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:create",
    schema: analyticInputSchema,
    formData,
    handler: (tx, input, actor) => createAnalyticAccount(tx, input, { userId: actor.id }),
    successMessage: "Analytic account created.",
    revalidate: ["/analytic"],
  });
}

export async function updateAnalyticAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:update",
    schema: analyticInputSchema,
    formData,
    handler: (tx, input, actor) => updateAnalyticAccount(tx, id, input, { userId: actor.id }),
    successMessage: "Analytic account updated.",
    revalidate: ["/analytic", `/analytic/${id}`],
  });
}

export async function archiveAnalyticAction(id: string, isArchived: boolean): Promise<ActionState> {
  return runAction({
    permission: "master:archive",
    handler: (tx, actor) => setAnalyticArchived(tx, id, isArchived, { userId: actor.id }),
    successMessage: isArchived ? "Analytic account archived." : "Analytic account restored.",
    revalidate: ["/analytic", `/analytic/${id}`],
  });
}
