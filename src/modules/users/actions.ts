"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, toActionState, toFieldErrors } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import { formDataToObject } from "@/modules/shared/zod-helpers";
import { withTransaction } from "@/server/db/prisma";
import { createUserSchema, signUpSchema } from "./schemas";
import { createUser, setUserActive, signUpPortalUser } from "./user-service";

/**
 * Administrator: create a login for someone.
 *
 * Goes through the standard pipeline, so the `user:manage` permission is
 * checked before anything else happens and the whole creation -- user, linked
 * contact, audit row -- commits or rolls back as one.
 */
export async function createUserAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "user:manage",
    schema: createUserSchema,
    formData,
    handler: (tx, input, actor) => createUser(tx, input, { actorId: actor.id }),
    successMessage: "User created.",
    revalidate: ["/users"],
  });
}

export async function setUserActiveAction(id: string, isActive: boolean): Promise<ActionState> {
  return runAction({
    permission: "user:manage",
    handler: (tx, actor) => setUserActive(tx, id, isActive, { actorId: actor.id }),
    successMessage: isActive ? "User reactivated." : "User deactivated.",
    revalidate: ["/users"],
  });
}

/**
 * Public sign-up.
 *
 * Deliberately does NOT use `runFormAction`: that pipeline starts by requiring
 * a permission, and there is no one signed in here. Everything else about the
 * shape is the same -- validate, run in a transaction, return form state, never
 * leak an internal error.
 *
 * The role is fixed inside `signUpPortalUser`; nothing the browser submits can
 * influence it.
 */
export async function signUpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = formDataToObject(formData);
  const parsed = signUpSchema.safeParse(raw);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
      // The passwords are deliberately not echoed back.
      values: { ...raw, password: "", confirmPassword: "" },
    };
  }

  try {
    const user = await withTransaction((tx) => signUpPortalUser(tx, parsed.data));
    revalidatePath("/users");

    return {
      status: "success",
      message: "Account created. You can sign in now.",
      id: user.id,
    };
  } catch (error) {
    return {
      ...toActionState(error, "Could not create the account."),
      values: { ...raw, password: "", confirmPassword: "" },
    };
  }
}
