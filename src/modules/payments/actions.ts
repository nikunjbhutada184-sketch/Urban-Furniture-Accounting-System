"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runFormAction } from "@/modules/shared/run-action";
import { formDataToObject } from "@/modules/shared/zod-helpers";
import { registerPayment } from "./payment-registration";
import { parseAllocationRows, registerPaymentSchema } from "./schemas";

/**
 * Register a standalone payment.
 *
 * Goes through the shared pipeline, so `payment:post` is checked before
 * anything happens and the payment, its journal entry and every allocation
 * commit or roll back as one.
 */
export async function registerPaymentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "payment:post",
    schema: registerPaymentSchema,
    formData: withParsedAllocations(formData),
    handler: (tx, input, actor) => registerPayment(tx, input, { userId: actor.id }),
    successMessage: "Payment registered and posted.",
    revalidate: ["/payments", "/sales/invoices", "/purchases/bills"],
  });
}

/**
 * The allocation table submits flat `allocations.<n>.<field>` keys, which have
 * to be rebuilt into an array before the schema sees them. Same shape as the
 * purchase and sales line editors.
 */
function withParsedAllocations(formData: FormData): FormData {
  const parsed = parseAllocationRows(formDataToObject(formData));

  const rebuilt = new FormData();
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "allocations") continue;
    if (typeof value === "string") rebuilt.set(key, value);
  }

  rebuilt.set("allocations", JSON.stringify(parsed.allocations ?? []));
  return rebuilt;
}
