import { revalidatePath } from "next/cache";
import { type z } from "zod";
import { type Actor, type Permission } from "@/server/auth/permissions";
import { requirePermission } from "@/server/auth/session";
import { type DbClient, withTransaction } from "@/server/db/prisma";
import { formDataToObject } from "./zod-helpers";
import { type ActionState, toActionState, toFieldErrors } from "./action-state";

/**
 * The single pipeline every mutating server action goes through:
 *
 *   authorise -> validate -> run inside a transaction -> revalidate -> report
 *
 * Centralising it means no action can accidentally skip the permission check,
 * run outside a transaction, or leak an internal error to the browser.
 */
export async function runFormAction<TSchema extends z.ZodTypeAny>(options: {
  permission: Permission;
  schema: TSchema;
  formData: FormData;
  /** Runs inside a database transaction. Return the affected record's id. */
  handler: (tx: DbClient, input: z.infer<TSchema>, actor: Actor) => Promise<{ id: string } | void>;
  successMessage: string;
  /** Paths to revalidate after a successful mutation. */
  revalidate?: string[];
}): Promise<ActionState> {
  let actor: Actor;

  try {
    actor = await requirePermission(options.permission);
  } catch (error) {
    return toActionState(error, "You are not allowed to do that.");
  }

  const raw = formDataToObject(options.formData);
  const parsed = options.schema.safeParse(raw);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
      values: raw,
    };
  }

  try {
    const result = await withTransaction((tx) => options.handler(tx, parsed.data, actor));

    for (const path of options.revalidate ?? []) {
      revalidatePath(path);
    }

    return { status: "success", message: options.successMessage, id: result?.id };
  } catch (error) {
    return { ...toActionState(error), values: raw };
  }
}

/**
 * Same pipeline for actions that take arguments directly rather than a form
 * (archive/restore, confirm, post, cancel), where there is nothing to validate
 * beyond the caller's permission.
 */
export async function runAction(options: {
  permission: Permission;
  handler: (tx: DbClient, actor: Actor) => Promise<{ id: string } | void>;
  successMessage: string;
  revalidate?: string[];
}): Promise<ActionState> {
  let actor: Actor;

  try {
    actor = await requirePermission(options.permission);
  } catch (error) {
    return toActionState(error, "You are not allowed to do that.");
  }

  try {
    const result = await withTransaction((tx) => options.handler(tx, actor));

    for (const path of options.revalidate ?? []) {
      revalidatePath(path);
    }

    return { status: "success", message: options.successMessage, id: result?.id };
  } catch (error) {
    return toActionState(error);
  }
}
