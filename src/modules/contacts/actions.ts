"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import { createContact, setContactArchived, updateContact } from "./contact-service";
import { contactInputSchema } from "./schemas";

/**
 * Contact server actions.
 *
 * Every mutation is server-side: the browser can only ask for a change, never
 * make one. Authorisation, validation and the transaction boundary are handled
 * by `runFormAction`.
 */

export async function createContactAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:create",
    schema: contactInputSchema,
    formData,
    handler: (tx, input, actor) => createContact(tx, input, { userId: actor.id }),
    successMessage: "Contact created.",
    revalidate: ["/contacts"],
  });
}

export async function updateContactAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "master:update",
    schema: contactInputSchema,
    formData,
    handler: (tx, input, actor) => updateContact(tx, id, input, { userId: actor.id }),
    successMessage: "Contact updated.",
    revalidate: ["/contacts", `/contacts/${id}`],
  });
}

/** Archiving is restricted to ADMIN by the permission matrix. */
export async function archiveContactAction(id: string, isArchived: boolean): Promise<ActionState> {
  return runAction({
    permission: "master:archive",
    handler: (tx, actor) => setContactArchived(tx, id, isArchived, { userId: actor.id }),
    successMessage: isArchived ? "Contact archived." : "Contact restored.",
    revalidate: ["/contacts", `/contacts/${id}`],
  });
}
