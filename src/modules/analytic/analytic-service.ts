import { type AnalyticAccount, type AnalyticAccountType, type Prisma } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { archiveWhere, searchWhere } from "@/modules/shared/list-filters";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { type AnalyticInput, type AnalyticSortField } from "./schemas";

/**
 * Analytic account service.
 *
 * Analytic accounts are tagged onto document lines and carried through to
 * journal items, so budgets can compare planned against actual. Like all
 * master data they are archived, never deleted.
 */

export interface AnalyticListRow {
  id: string;
  code: string;
  name: string;
  type: AnalyticAccountType;
  itemCount: number;
  budgetLineCount: number;
  isArchived: boolean;
}

function buildWhere(params: ListParams<AnalyticSortField>): Prisma.AnalyticAccountWhereInput {
  const where: Prisma.AnalyticAccountWhereInput = { ...archiveWhere(params.filters.status) };

  if (params.filters.type) where.type = params.filters.type as AnalyticAccountType;
  if (params.search) Object.assign(where, searchWhere(params.search, ["code", "name"]));

  return where;
}

export async function listAnalyticAccounts(
  params: ListParams<AnalyticSortField>,
  client: DbClient = prisma,
): Promise<{ rows: AnalyticListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.analyticAccount.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        isArchived: true,
        _count: { select: { journalItems: true, budgetLines: true } },
      },
    }),
    client.analyticAccount.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      code: record.code,
      name: record.name,
      type: record.type,
      itemCount: record._count.journalItems,
      budgetLineCount: record._count.budgetLines,
      isArchived: record.isArchived,
    })),
  };
}

export async function getAnalyticAccount(
  id: string,
  client: DbClient = prisma,
): Promise<AnalyticAccount> {
  const account = await client.analyticAccount.findUnique({ where: { id } });
  if (!account) throw new NotFoundError("Analytic account", id);
  return account;
}

export async function listAnalyticOptions(client: DbClient = prisma) {
  return client.analyticAccount.findMany({
    where: { isArchived: false },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });
}

async function assertCodeAvailable(
  client: DbClient,
  code: string,
  excludeId?: string,
): Promise<void> {
  const existing = await client.analyticAccount.findFirst({
    where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Analytic code "${code}" is already in use.`, {
      fieldErrors: { code: "This code is already in use." },
    });
  }
}

export async function createAnalyticAccount(
  tx: DbClient,
  input: AnalyticInput,
  context: { userId?: string | null } = {},
): Promise<AnalyticAccount> {
  await assertCodeAvailable(tx, input.code);

  const account = await tx.analyticAccount.create({ data: input });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "AnalyticAccount",
      entityId: account.id,
      summary: `Created analytic account ${account.code} ${account.name}`,
    },
    context,
  );

  return account;
}

export async function updateAnalyticAccount(
  tx: DbClient,
  id: string,
  input: AnalyticInput,
  context: { userId?: string | null } = {},
): Promise<AnalyticAccount> {
  const existing = await getAnalyticAccount(id, tx);
  await assertCodeAvailable(tx, input.code, id);

  // Flipping income/expense would silently re-sign every budget comparison
  // already built on this analytic account.
  if (existing.type !== input.type) {
    const [items, budgetLines] = await Promise.all([
      tx.journalItem.count({ where: { analyticAccountId: id } }),
      tx.budgetLine.count({ where: { analyticAccountId: id } }),
    ]);

    if (items + budgetLines > 0) {
      throw new ConflictError(
        `${existing.name} is already used by ${items} journal item(s) and ${budgetLines} budget line(s). Its type cannot be changed.`,
        { fieldErrors: { type: "Cannot change the type of an analytic account already in use." } },
      );
    }
  }

  const account = await tx.analyticAccount.update({ where: { id }, data: input });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "AnalyticAccount",
      entityId: id,
      summary: `Updated analytic account ${account.code} ${account.name}`,
    },
    context,
  );

  return account;
}

export async function setAnalyticArchived(
  tx: DbClient,
  id: string,
  isArchived: boolean,
  context: { userId?: string | null } = {},
): Promise<AnalyticAccount> {
  const existing = await getAnalyticAccount(id, tx);
  if (existing.isArchived === isArchived) return existing;

  const account = await tx.analyticAccount.update({ where: { id }, data: { isArchived } });

  await recordAudit(
    tx,
    {
      action: isArchived ? "archive" : "restore",
      entity: "AnalyticAccount",
      entityId: id,
      summary: `${isArchived ? "Archived" : "Restored"} analytic account ${account.code} ${account.name}`,
    },
    context,
  );

  return account;
}

export async function countAnalyticReferences(
  id: string,
  client: DbClient = prisma,
): Promise<number> {
  const [items, budgetLines] = await Promise.all([
    client.journalItem.count({ where: { analyticAccountId: id } }),
    client.budgetLine.count({ where: { analyticAccountId: id } }),
  ]);

  return items + budgetLines;
}

export async function assertAnalyticDeletable(client: DbClient, id: string): Promise<void> {
  const references = await countAnalyticReferences(id, client);

  if (references > 0) {
    throw new ValidationError(
      `This analytic account is referenced by ${references} record(s) and cannot be deleted. Archive it instead.`,
    );
  }
}
