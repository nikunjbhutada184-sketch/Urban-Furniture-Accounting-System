"use server";

import { type ActionState } from "@/modules/shared/action-state";
import { runFormAction } from "@/modules/shared/run-action";
import { companySettingsSchema } from "./schemas";
import { updateCompanySettings } from "./settings-service";

/** Save the company settings. ADMIN only, via the `settings:manage` permission. */
export async function updateCompanySettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "settings:manage",
    schema: companySettingsSchema,
    formData,
    handler: (tx, input, actor) => updateCompanySettings(tx, input, { actorId: actor.id }),
    successMessage: "Company settings saved.",
    revalidate: ["/settings"],
  });
}
