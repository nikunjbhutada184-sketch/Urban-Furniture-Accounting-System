import { type UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { ForbiddenError, UnauthenticatedError } from "@/server/errors";
import { auth } from "./index";
import {
  type AccessScope,
  type Actor,
  type Permission,
  assertPermission,
  can,
  canAccessContact,
  getAccessScope,
} from "./permissions";

/**
 * Re-exported so callers have a single import for authorisation helpers.
 * The implementation lives in `./permissions` because it is pure.
 */
export { canAccessContact };

/**
 * Server-side authorisation helpers.
 *
 * These are the ONLY sanctioned way to authorise work. Hiding a button in the
 * UI is presentation, not security: every server action, route handler, page
 * loader, mutation, report and payment operation calls one of these first.
 *
 * `require*` helpers throw domain errors, which server actions map to form
 * errors and route handlers map to HTTP status codes. The `*OrRedirect`
 * variants are for pages, where a redirect is the better experience.
 */

/** Returns the current actor, or null when signed out. Never throws. */
export async function getCurrentActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    role: session.user.role,
    contactId: session.user.contactId ?? null,
  };
}

/**
 * Asserts that a request is authenticated and returns the actor.
 * @throws UnauthenticatedError when signed out.
 */
export async function requireAuth(): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/**
 * Asserts the caller holds one of `roles`.
 * @throws UnauthenticatedError when signed out, ForbiddenError on the wrong role.
 */
export async function requireRole(roles: UserRole | UserRole[]): Promise<Actor> {
  const actor = await requireAuth();
  const allowed = Array.isArray(roles) ? roles : [roles];

  if (!allowed.includes(actor.role)) {
    throw new ForbiddenError(
      `This action requires the ${allowed.join(" or ")} role. Your role is ${actor.role}.`,
    );
  }

  return actor;
}

/**
 * Asserts the caller holds `permission`, per the role matrix.
 * Prefer this over `requireRole`: it survives roles being added or reshaped.
 */
export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await requireAuth();
  assertPermission(actor, permission);
  return actor;
}

/**
 * Throwing form of {@link canAccessContact}.
 * @throws ForbiddenError when the actor may not touch this contact's data.
 */
export async function requireContactAccess(contactId: string): Promise<Actor> {
  const actor = await requireAuth();

  if (!canAccessContact(actor, contactId)) {
    throw new ForbiddenError("You can only access your own documents.");
  }

  return actor;
}

/**
 * The scope every list query must be filtered by. Returns `{ kind: "none" }`
 * for signed-out callers, which the query helpers translate into a filter that
 * matches nothing -- failing closed.
 */
export async function requireAccessScope(): Promise<AccessScope> {
  const actor = await getCurrentActor();
  return getAccessScope(actor);
}

/** Non-throwing permission check, for conditionally rendering UI affordances. */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const actor = await getCurrentActor();
  return can(actor, permission);
}

// ---------------------------------------------------------------------------
// Page-level variants: redirect instead of throwing.
// ---------------------------------------------------------------------------

/** For page components: sends signed-out visitors to the login page. */
export async function requireAuthOrRedirect(returnTo?: string): Promise<Actor> {
  const actor = await getCurrentActor();
  if (!actor) {
    const target = returnTo ? `/login?callbackUrl=${encodeURIComponent(returnTo)}` : "/login";
    redirect(target);
  }
  return actor;
}

/**
 * For page components: signed-out visitors go to login; signed-in visitors
 * without the permission are sent to the home page for their role rather than
 * being shown an error they can do nothing about.
 */
export async function requirePermissionOrRedirect(permission: Permission): Promise<Actor> {
  const actor = await requireAuthOrRedirect();
  if (!can(actor, permission)) {
    redirect(homePathForRole(actor.role));
  }
  return actor;
}

/** Where a role lands after signing in. */
export function homePathForRole(role: UserRole): string {
  return role === "CONTACT" ? "/portal" : "/dashboard";
}
