import { UserRole } from "@prisma/client";
import { ForbiddenError, UnauthenticatedError } from "@/server/errors";

/**
 * The authorisation matrix.
 *
 * Single source of truth for "who may do what". Adding a capability means
 * adding one permission string and listing it against the roles that hold it --
 * never an `if (role === "ADMIN")` scattered through the codebase.
 */

export const PERMISSIONS = [
  // Master data
  "master:view",
  "master:create",
  "master:update",
  "master:archive",

  // Transactions
  "transaction:view",
  "transaction:create",
  "transaction:update",
  "transaction:post",
  "transaction:cancel",
  "transaction:reverse",

  // Payments
  "payment:view",
  "payment:create",
  "payment:post",

  // Portal (a contact's own documents)
  "portal:view-own",
  "portal:pay-own",

  // Reporting
  "report:view",

  // Budgets
  "budget:view",
  "budget:manage",

  // Administration
  "user:manage",
  "settings:manage",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ACCOUNTANT_PERMISSIONS: readonly Permission[] = [
  "master:view",
  "master:create",
  "master:update",
  // Deliberately NOT master:archive -- archiving master data is the owner's call.
  "transaction:view",
  "transaction:create",
  "transaction:update",
  "transaction:post",
  "transaction:cancel",
  "payment:view",
  "payment:create",
  "payment:post",
  "report:view",
  "budget:view",
  "budget:manage",
];

const CONTACT_PERMISSIONS: readonly Permission[] = ["portal:view-own", "portal:pay-own"];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  // The owner holds every permission.
  [UserRole.ADMIN]: new Set(PERMISSIONS),
  [UserRole.ACCOUNTANT]: new Set(ACCOUNTANT_PERMISSIONS),
  [UserRole.CONTACT]: new Set(CONTACT_PERMISSIONS),
};

/**
 * Whether this build recognises the role on a session.
 *
 * A token can carry a role we do not know about (a stale cookie, a renamed
 * role, a tampered payload). Such a session is not usable, and callers must
 * send it back to sign in rather than bounce it around the app.
 */
export function isKnownRole(role: unknown): role is UserRole {
  return typeof role === "string" && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

/** The minimum a caller must present to be authorised. */
export interface Actor {
  id: string;
  role: UserRole;
  /** Set for portal users: the contact whose data they may see. */
  contactId?: string | null;
}

export function can(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return false;

  // An unrecognised role grants nothing. A session token can carry a role this
  // build does not know about -- an old cookie, a renamed role, a tampered
  // payload -- and indexing blindly would throw here, turning a bad cookie into
  // a 500 on every authenticated page. Fail closed instead.
  const permissions = ROLE_PERMISSIONS[actor.role];
  if (!permissions) return false;

  return permissions.has(permission);
}

export function canAll(actor: Actor | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((permission) => can(actor, permission));
}

/**
 * Guard for every mutation. Throws rather than returning a boolean so a
 * forgotten check cannot silently fall through to the happy path.
 */
export function assertPermission(
  actor: Actor | null | undefined,
  permission: Permission,
): asserts actor is Actor {
  if (!actor) throw new UnauthenticatedError();
  if (!can(actor, permission)) {
    throw new ForbiddenError(`Your role (${actor.role}) does not allow '${permission}'.`);
  }
}

/**
 * Row-level scoping.
 *
 * Portal users must only ever see their own contact's documents. Services take
 * an `AccessScope` and apply `contactId` to every query, so a `CONTACT` cannot
 * read another contact's data even by supplying a forged id.
 */
export type AccessScope =
  { kind: "all" } | { kind: "contact"; contactId: string } | { kind: "none" };

export function getAccessScope(actor: Actor | null | undefined): AccessScope {
  if (!actor) return { kind: "none" };

  if (actor.role === UserRole.CONTACT) {
    return actor.contactId ? { kind: "contact", contactId: actor.contactId } : { kind: "none" };
  }

  // Only the back-office roles see everything. Anything else -- including a
  // role this build does not recognise -- gets no access at all. Defaulting to
  // "all" here would hand an unknown role the whole database.
  if (actor.role === UserRole.ADMIN || actor.role === UserRole.ACCOUNTANT) {
    return { kind: "all" };
  }

  return { kind: "none" };
}

/**
 * Turns a scope into a Prisma `where` fragment on a `contactId`-like column.
 * `{ kind: "none" }` yields an impossible filter rather than an open one --
 * failing closed is the only safe default.
 */
export function scopeToWhere(scope: AccessScope, field = "contactId"): Record<string, unknown> {
  switch (scope.kind) {
    case "all":
      return {};
    case "contact":
      return { [field]: scope.contactId };
    case "none":
      return { [field]: "__no_access__" };
  }
}

/**
 * Contact isolation.
 *
 * ADMIN and ACCOUNTANT may access any contact. A CONTACT portal user may
 * access exactly one: their own. A portal user with no linked contact can
 * access none -- failing closed.
 *
 * Pure and dependency-free so it can be unit-tested and reused anywhere.
 */
export function canAccessContact(actor: Actor | null | undefined, contactId: string): boolean {
  if (!actor) return false;

  const scope = getAccessScope(actor);
  if (scope.kind === "all") return true;
  if (scope.kind === "contact") return scope.contactId === contactId;
  return false;
}

/** Asserts the actor may act on a document belonging to `contactId`. */
export function assertOwnership(actor: Actor | null | undefined, contactId: string): void {
  if (!actor) throw new UnauthenticatedError();

  if (!canAccessContact(actor, contactId)) {
    throw new ForbiddenError("You can only access your own documents.");
  }
}
