"use server";

import { JournalType, PaymentDirection } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { registerPayment } from "@/modules/payments/payment-registration";
import { type ActionState, toActionState, toFieldErrors } from "@/modules/shared/action-state";
import { formDataToObject } from "@/modules/shared/zod-helpers";
import { requirePermission } from "@/server/auth/session";
import { withTransaction } from "@/server/db/prisma";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { portalPaymentSchema } from "./schemas";

/**
 * A portal user paying one of their own invoices.
 *
 * Deliberately NOT the back-office payment action. Three things are fixed
 * server-side and cannot be influenced by the form:
 *
 *   - the contact is the one bound to the session, never a submitted id,
 *   - the direction is always INBOUND (a customer cannot pay themselves out),
 *   - the invoice must belong to that contact, which `registerPayment`
 *     re-checks by loading the contact's own open documents.
 *
 * So a portal user cannot settle another customer's invoice even by forging
 * every field in the request.
 */
export async function payOwnInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let contactId: string;

  try {
    const actor = await requirePermission("portal:pay-own");

    if (!actor.contactId) {
      throw new ForbiddenError(
        "Your login is not linked to a customer account, so it cannot make a payment.",
      );
    }

    contactId = actor.contactId;
  } catch (error) {
    return toActionState(error, "You are not allowed to do that.");
  }

  const raw = formDataToObject(formData);
  const parsed = portalPaymentSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
      values: raw,
    };
  }

  const input = parsed.data;

  try {
    await withTransaction(async (tx) => {
      // Pick the company's bank journal here rather than letting the browser
      // name one: a portal user has no business choosing which ledger account
      // the money lands in.
      const journal = await tx.journal.findFirst({
        where: { isArchived: false, type: JournalType.BANK, paymentAccountId: { not: null } },
        orderBy: { code: "asc" },
        select: { id: true },
      });

      if (!journal) {
        throw new ValidationError(
          "Online payment is not available at the moment. Please contact Urban Furniture.",
        );
      }

      return registerPayment(
        tx,
        {
          direction: PaymentDirection.INBOUND,
          contactId,
          journalId: journal.id,
          paymentDate: input.paymentDate,
          amount: input.amount,
          reference: input.reference,
          note: "Paid through the customer portal",
          allocations: [{ documentId: input.invoiceId, amount: input.amount }],
        },
        // Attribution is intentionally left null: the payment was made by the
        // customer, not recorded by a member of staff.
        {},
      );
    });

    revalidatePath("/portal");
    revalidatePath("/portal/invoices");
    revalidatePath(`/portal/invoices/${input.invoiceId}`);

    return { status: "success", message: "Payment received. Thank you." };
  } catch (error) {
    return { ...toActionState(error, "The payment could not be completed."), values: raw };
  }
}
