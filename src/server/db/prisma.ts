import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would open a
 * new connection pool each time. Caching on `globalThis` avoids exhausting
 * Postgres connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * The transactional client handed to services.
 *
 * Every service that writes accounting data accepts a `DbClient` so it can be
 * composed inside a single `prisma.$transaction(...)` with other services.
 * Services must never call the module-level `prisma` singleton directly for
 * writes -- that would escape the surrounding transaction.
 */
export type DbClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Runs `fn` inside a database transaction. All-or-nothing: if any step throws,
 * every write is rolled back. Use this for anything that touches more than one
 * accounting record (e.g. posting a bill writes the bill, its journal entry and
 * its journal items).
 */
export function withTransaction<T>(
  fn: (tx: DbClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: options?.maxWait ?? 5_000,
    timeout: options?.timeout ?? 15_000,
  });
}
