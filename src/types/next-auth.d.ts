import { type UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

/**
 * Augments the Auth.js session and JWT with the fields authorisation depends
 * on. `role` and `contactId` travel in the token so every server action can
 * authorise without a database round-trip.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      contactId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    contactId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    contactId: string | null;
  }
}

export {};
