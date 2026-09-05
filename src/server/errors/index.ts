/**
 * Domain error taxonomy.
 *
 * Services throw these; the presentation layer (server actions / route
 * handlers) maps them to HTTP status codes or form errors. Services never
 * throw raw strings and never return `null` to signal a business failure.
 */

export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNBALANCED_ENTRY"
  | "INVALID_JOURNAL_LINE"
  | "PERIOD_LOCKED"
  | "INVALID_STATE_TRANSITION"
  | "OVER_ALLOCATION"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 422, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super("NOT_FOUND", id ? `${entity} '${id}' was not found.` : `${entity} was not found.`, 404);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You must be signed in to do that.") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super("FORBIDDEN", message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, 409, details);
  }
}

/**
 * The cardinal accounting failure: total debits !== total credits.
 * Thrown by the posting engine before anything is written.
 */
export class UnbalancedEntryError extends AppError {
  constructor(totalDebit: string, totalCredit: string, difference: string) {
    super(
      "UNBALANCED_ENTRY",
      `Journal entry is not balanced: debits ${totalDebit} != credits ${totalCredit} (difference ${difference}). The entry was not posted.`,
      422,
      { totalDebit, totalCredit, difference },
    );
  }
}

export class InvalidJournalLineError extends AppError {
  constructor(message: string, details?: unknown) {
    super("INVALID_JOURNAL_LINE", message, 422, details);
  }
}

/** An entry was dated on or before the accounting lock date. */
export class PeriodLockedError extends AppError {
  constructor(date: string, lockDate: string) {
    super(
      "PERIOD_LOCKED",
      `Cannot post an entry dated ${date}: the accounting period is locked up to and including ${lockDate}.`,
      422,
      { date, lockDate },
    );
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string) {
    super("INVALID_STATE_TRANSITION", `Cannot move ${entity} from '${from}' to '${to}'.`, 409, {
      entity,
      from,
      to,
    });
  }
}

/** A payment allocation would exceed the document's outstanding balance. */
export class OverAllocationError extends AppError {
  constructor(document: string, residual: string, requested: string) {
    super(
      "OVER_ALLOCATION",
      `Cannot allocate ${requested} to ${document}: only ${residual} is outstanding.`,
      422,
      { document, residual, requested },
    );
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Normalises anything thrown into a client-safe shape. */
export function toErrorResponse(error: unknown): {
  code: AppErrorCode;
  message: string;
  status: number;
  details?: unknown;
} {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong. Please try again.",
    status: 500,
  };
}
