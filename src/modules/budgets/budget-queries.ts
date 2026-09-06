import { UserRole } from "@prisma/client";
import { type DbClient, prisma } from "@/server/db/prisma";

/**
 * People who can be made responsible for a budget.
 *
 * Portal users are excluded: a contact never owns internal planning.
 */
export async function listBudgetOwners(
  client: DbClient = prisma,
): Promise<{ id: string; name: string }[]> {
  return client.user.findMany({
    where: { isActive: true, role: { in: [UserRole.ADMIN, UserRole.ACCOUNTANT] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
