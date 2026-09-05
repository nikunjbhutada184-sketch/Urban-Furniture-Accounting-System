"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import { createJournal, setJournalArchived, updateJournal } from "./journal-service";
import { journalInputSchema } from "./schemas";

export async function createJournalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:create",
    schema: journalInputSchema,
    formData,
    handler: (tx, input, actor) => createJournal(tx, input, { userId: actor.id }),
    successMessage: "Journal created.",
    revalidate: ["/journals"],
  });
}

export async function updateJournalAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:update",
    schema: journalInputSchema,
    formData,
    handler: (tx, input, actor) => updateJournal(tx, id, input, { userId: actor.id }),
    successMessage: "Journal updated.",
    revalidate: ["/journals", `/journals/${id}`],
  });
}

export async function archiveJournalAction(id: string, isArchived: boolean): Promise<ActionState> {
  return runAction({
    permission: "master:archive",
    handler: (tx, actor) => setJournalArchived(tx, id, isArchived, { userId: actor.id }),
    successMessage: isArchived ? "Journal archived." : "Journal restored.",
    revalidate: ["/journals", `/journals/${id}`],
  });
}
