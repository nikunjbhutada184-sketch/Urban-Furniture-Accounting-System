import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { authConfig } from "./auth.config";

/**
 * Full Auth.js configuration (Node runtime).
 *
 * Credentials + JWT sessions. The Prisma adapter is wired up so an SSO provider
 * can be added later without a data migration; with the credentials provider
 * the session itself is carried in the JWT, not in the database.
 */

const credentialsSchema = z.object({
  /**
   * What the sign-in form calls "Login Id". An email address is accepted here
   * too, so an existing account can still sign in the way it always has.
   */
  loginId: z.string().min(1).max(160),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        loginId: { label: "Login Id", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { loginId, password } = parsed.data;
        const identifier = loginId.toLowerCase().trim();

        // Login ids and emails are both stored lower-cased and are unique
        // across their own columns, so at most one row can match.
        const user = await prisma.user.findFirst({
          where: { OR: [{ loginId: identifier }, { email: identifier }] },
          select: {
            id: true,
            loginId: true,
            email: true,
            name: true,
            image: true,
            role: true,
            contactId: true,
            isActive: true,
            passwordHash: true,
          },
        });

        // Always run a comparison so a missing account and a wrong password
        // take the same amount of time (no user enumeration via timing).
        const hash = user?.passwordHash ?? BCRYPT_DUMMY_HASH;
        const passwordMatches = await bcrypt.compare(password, hash);

        if (!user || !user.passwordHash || !passwordMatches || !user.isActive) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          contactId: user.contactId,
        };
      },
    }),
  ],
});

/** bcrypt hash of a value no user can have. Used for constant-time failure. */
const BCRYPT_DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
