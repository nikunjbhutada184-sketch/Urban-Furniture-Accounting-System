import { type UserRole } from "@prisma/client";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/auth.config";

/**
 * Coarse route protection (Next.js `proxy` convention, formerly `middleware`).
 *
 * This is a convenience layer only: it keeps signed-out visitors off private
 * pages and stops a portal user from loading the back-office shell. It is NOT
 * the authorisation boundary -- the proxy does not run for direct server
 * action invocations, so every action, mutation, query, report and payment
 * operation re-checks permissions server-side via `requirePermission` /
 * `requireContactAccess` / `requireRole`.
 */

const { auth } = NextAuth(authConfig);

/** Routes reachable without a session. */
const PUBLIC_PATHS = ["/login", "/api/auth"];

/** Route prefixes only the back office (ADMIN / ACCOUNTANT) may load. */
const BACK_OFFICE_PREFIXES = [
  "/dashboard",
  "/contacts",
  "/products",
  "/accounts",
  "/journals",
  "/journal-entries",
  "/purchases",
  "/sales",
  "/payments",
  "/analytic",
  "/budgets",
  "/reports",
  "/settings",
  "/users",
];

/** Route prefixes only a portal user needs. */
const PORTAL_PREFIXES = ["/portal"];

/** Route prefixes reserved for ADMIN. */
const ADMIN_PREFIXES = ["/settings", "/users"];

function startsWithAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Roles this build understands. Declared inline rather than imported so the
 * proxy stays free of any Prisma import on the Edge runtime.
 */
const KNOWN_ROLES = ["ADMIN", "ACCOUNTANT", "CONTACT"] as const;

function isKnownRole(role: UserRole | undefined): role is UserRole {
  return typeof role === "string" && (KNOWN_ROLES as readonly string[]).includes(role);
}

function homePathForRole(role: UserRole | undefined): string {
  return role === "CONTACT" ? "/portal" : "/dashboard";
}

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const user = request.auth?.user;
  const role = user?.role;

  if (startsWithAny(pathname, PUBLIC_PATHS)) {
    // Already signed in with a usable role? Skip the login page.
    //
    // A session carrying an unrecognised role must be allowed to REACH /login:
    // sending it to a role home would bounce it straight back here, and the
    // browser would give up with "too many redirects".
    if (user && isKnownRole(role) && pathname === "/login") {
      return NextResponse.redirect(new URL(homePathForRole(role), request.nextUrl));
    }
    return NextResponse.next();
  }

  if (!user) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Portal users are confined to /portal.
  if (role === "CONTACT" && !startsWithAny(pathname, PORTAL_PREFIXES)) {
    return NextResponse.redirect(new URL("/portal", request.nextUrl));
  }

  // Back-office users have no business in the portal.
  if (role !== "CONTACT" && startsWithAny(pathname, PORTAL_PREFIXES)) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  // Administration is ADMIN-only.
  if (role === "ACCOUNTANT" && startsWithAny(pathname, ADMIN_PREFIXES)) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
  }

  if (role !== "CONTACT" && !startsWithAny(pathname, BACK_OFFICE_PREFIXES) && pathname !== "/") {
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
