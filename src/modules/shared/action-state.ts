import { type z } from "zod";
import { isAppError } from "@/server/errors";

/**
 * The shape every server action returns to a form.
 *
 * Actions never throw at the UI: they catch domain errors and return a typed
 * result, so forms can render field-level and form-level messages without a
 * client-side error boundary.
 */
export interface ActionState<TValues = Record<string, unknown>> {
  status: "idle" | "success" | "error";
  message?: string;
  /** Field name -> first error message. */
  fieldErrors?: Record<string, string>;
  /** Echoed back so the form can repopulate after a failed submit. */
  values?: TValues;
  /** Id of the record created or updated, for redirects. */
  id?: string;
}

export const IDLE_STATE: ActionState = { status: "idle" };

export function successState(message: string, id?: string): ActionState {
  return { status: "success", message, id };
}

export function errorState(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: "error", message, fieldErrors };
}

/** Flattens a Zod error into `{ field: message }`, keeping the first message. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
  }

  return fieldErrors;
}

/**
 * Converts anything thrown by a service into an `ActionState`.
 *
 * Domain errors carry a message written for the user. Anything else is logged
 * and replaced with a generic message, so an internal failure never leaks a
 * stack trace or SQL to the browser.
 */
export function toActionState(error: unknown, fallback = "Something went wrong."): ActionState {
  if (isAppError(error)) {
    const details = error.details as { fieldErrors?: Record<string, string> } | undefined;
    return {
      status: "error",
      message: error.message,
      fieldErrors: details?.fieldErrors,
    };
  }

  console.error("[action] unhandled error:", error);
  return { status: "error", message: fallback };
}
