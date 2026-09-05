import { type UserRole } from "@prisma/client";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js configuration.
 *
 * `middleware.ts` runs on the Edge runtime, where Prisma and bcrypt cannot be
 * loaded. This file therefore contains only callbacks and page routes -- no
 * providers, no database. The full configuration (credentials provider +
 * Prisma adapter) lives in `./index.ts` and is used by the Node runtime.
 */
export const authConfig: NextAuthConfig = {
  // Providers are supplied by the Node-runtime configuration in ./index.ts.
  providers: [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 hours - a working day
  },
  callbacks: {
    /**
     * Copies the identity fields authorisation depends on into the token, once,
     * at sign-in. Every later request reads them from the token instead of
     * hitting the database.
     */
    jwt({ token, user }) {
      if (user) {
        const authUser = user as { id?: string; role?: UserRole; contactId?: string | null };
        token.id = authUser.id ?? token.sub ?? "";
        token.role = authUser.role;
        token.contactId = authUser.contactId ?? null;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? token.sub ?? "";
        session.user.role = token.role as UserRole;
        session.user.contactId = (token.contactId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  trustHost: true,
};
