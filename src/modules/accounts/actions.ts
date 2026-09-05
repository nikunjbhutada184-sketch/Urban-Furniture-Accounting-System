"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import { createAccount, setAccountArchived, updateAccount } from "./account-service";
import { accountInputSchema } from "./schemas";

export async function createAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:create",
    schema: accountInputSchema,
    formData,
    handler: (tx, input, actor) => createAccount(tx, input, { userId: actor.id }),
    successMessage: "Account created.",
    revalidate: ["/accounts"],
  });
}

export async function updateAccountAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:update",
    schema: accountInputSchema,
    formData,
    handler: (tx, input, actor) => updateAccount(tx, id, input, { userId: actor.id }),
    successMessage: "Account updated.",
    revalidate: ["/accounts", `/accounts/${id}`],
  });
}

export async function archiveAccountAction(id: string, isArchived: boolean): Promise<ActionState> {
  return runAction({
    permission: "master:archive",
    handler: (tx, actor) => setAccountArchived(tx, id, isArchived, { userId: actor.id }),
    successMessage: isArchived ? "Account archived." : "Account restored.",
    revalidate: ["/accounts", `/accounts/${id}`],
  });
}
