"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runFormAction } from "@/modules/shared/run-action";
import { stockAdjustmentSchema } from "./schemas";
import { adjustStock } from "./stock-service";

/**
 * Inventory server actions.
 *
 * A stock adjustment changes what the business believes it owns, so it is a
 * transaction-level action, not master data: it needs `transaction:create` and
 * runs inside the shared authorise -> validate -> transaction pipeline.
 */
export async function adjustStockAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "transaction:create",
    schema: stockAdjustmentSchema,
    formData,
    handler: async (tx, input, actor) => {
      const move = await adjustStock(tx, input, { userId: actor.id });
      return { id: move.productId };
    },
    successMessage: "Stock adjusted.",
    revalidate: ["/inventory"],
  });
}
