import type { AccountKind, AccountType, LedgerAccount, Prisma } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { archiveWhere, searchWhere } from "@/modules/shared/list-filters";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { type AccountInput, type AccountSortField } from "./schemas";

/**
 * Chart of Accounts service.
 *
 * Accounts are the classification backbone of the ledger. They are archived,
 * never deleted: every posted journal item points at one, and reports must be
 * able to name it forever.
 */

export interface AccountListRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  kind: string;
  parentLabel: string | null;
  isReconcilable: boolean;
  isArchived: boolean;
  itemCount: number;
}

function buildWhere(params: ListParams<AccountSortField>): Prisma.LedgerAccountWhereInput {
  const where: Prisma.LedgerAccountWhereInput = { ...archiveWhere(params.filters.status) };

  if (params.filters.type) where.type = params.filters.type as AccountType;
  if (params.search) Object.assign(where, searchWhere(params.search, ["code", "name"]));

  return where;
}

export async function listAccounts(
  params: ListParams<AccountSortField>,
  client: DbClient = prisma,
): Promise<{ rows: AccountListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.ledgerAccount.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        kind: true,
        isReconcilable: true,
        isArchived: true,
        parent: { select: { code: true, name: true } },
        _count: { select: { journalItems: true } },
      },
    }),
    client.ledgerAccount.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      code: record.code,
      name: record.name,
      type: record.type,
      kind: record.kind,
      parentLabel: record.parent ? `${record.parent.code} · ${record.parent.name}` : null,
      isReconcilable: record.isReconcilable,
      isArchived: record.isArchived,
      itemCount: record._count.journalItems,
    })),
  };
}

export async function getAccount(id: string, client: DbClient = prisma): Promise<LedgerAccount> {
  const account = await client.ledgerAccount.findUnique({ where: { id } });
  if (!account) throw new NotFoundError("Account", id);
  return account;
}

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  label: string;
}

/**
 * Accounts selectable on a form, optionally narrowed to a statement type or a
 * set of machine roles (e.g. only cash/bank accounts for a payment journal).
 */
export async function listAccountOptions(
  filter: { type?: AccountType; kinds?: AccountKind[] } = {},
  client: DbClient = prisma,
): Promise<AccountOption[]> {
  const accounts = await client.ledgerAccount.findMany({
    where: {
      isArchived: false,
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.kinds ? { kind: { in: filter.kinds } } : {}),
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  return accounts.map((account) => ({
    ...account,
    label: `${account.code} · ${account.name}`,
  }));
}

/** Accounts selectable as a parent, excluding the account being edited. */
export async function listParentOptions(excludeId?: string, client: DbClient = prisma) {
  return client.ledgerAccount.findMany({
    where: { isArchived: false, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
}

async function assertCodeAvailable(
  client: DbClient,
  code: string,
  excludeId?: string,
): Promise<void> {
  const existing = await client.ledgerAccount.findFirst({
    where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Account code "${code}" is already in use.`, {
      fieldErrors: { code: "This account code is already in use." },
    });
  }
}

/**
 * Prevents a cycle in the account tree: an account may not be its own parent,
 * nor the parent of one of its own ancestors.
 */
async function assertNoCycle(
  client: DbClient,
  accountId: string,
  parentId: string | null,
): Promise<void> {
  if (!parentId) return;

  if (parentId === accountId) {
    throw new ValidationError("An account cannot be its own parent.", {
      fieldErrors: { parentId: "An account cannot be its own parent." },
    });
  }

  const seen = new Set<string>([accountId]);
  let cursor: string | null = parentId;

  while (cursor) {
    if (seen.has(cursor)) {
      throw new ValidationError("That parent would create a loop in the account tree.", {
        fieldErrors: { parentId: "This would create a loop in the account hierarchy." },
      });
    }
    seen.add(cursor);

    const parent: { parentId: string | null } | null = await client.ledgerAccount.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
}

export async function createAccount(
  tx: DbClient,
  input: AccountInput,
  context: { userId?: string | null } = {},
): Promise<LedgerAccount> {
  await assertCodeAvailable(tx, input.code);

  const account = await tx.ledgerAccount.create({ data: input });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "LedgerAccount",
      entityId: account.id,
      summary: `Created account ${account.code} ${account.name}`,
    },
    context,
  );

  return account;
}

export async function updateAccount(
  tx: DbClient,
  id: string,
  input: AccountInput,
  context: { userId?: string | null } = {},
): Promise<LedgerAccount> {
  const existing = await getAccount(id, tx);
  await assertCodeAvailable(tx, input.code, id);
  await assertNoCycle(tx, id, input.parentId);

  // Changing an account's type would silently move historic postings between
  // the balance sheet and the P&L, so it is blocked once the account is used.
  if (existing.type !== input.type) {
    const postedItems = await tx.journalItem.count({ where: { accountId: id } });

    if (postedItems > 0) {
      throw new ConflictError(
        `${existing.code} ${existing.name} already has ${postedItems} journal item(s). Its type cannot be changed, because that would move posted history between the Balance Sheet and the Profit & Loss.`,
        { fieldErrors: { type: "Cannot change the type of an account that has been posted to." } },
      );
    }
  }

  const account = await tx.ledgerAccount.update({ where: { id }, data: input });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "LedgerAccount",
      entityId: id,
      summary: `Updated account ${account.code} ${account.name}`,
    },
    context,
  );

  return account;
}

export async function setAccountArchived(
  tx: DbClient,
  id: string,
  isArchived: boolean,
  context: { userId?: string | null } = {},
): Promise<LedgerAccount> {
  const existing = await getAccount(id, tx);
  if (existing.isArchived === isArchived) return existing;

  if (isArchived) {
    await assertNotACompanyDefault(tx, id, existing);

    const activeChildren = await tx.ledgerAccount.count({
      where: { parentId: id, isArchived: false },
    });

    if (activeChildren > 0) {
      throw new ConflictError(
        `${existing.code} ${existing.name} has ${activeChildren} active child account(s). Archive those first.`,
      );
    }
  }

  const account = await tx.ledgerAccount.update({ where: { id }, data: { isArchived } });

  await recordAudit(
    tx,
    {
      action: isArchived ? "archive" : "restore",
      entity: "LedgerAccount",
      entityId: id,
      summary: `${isArchived ? "Archived" : "Restored"} account ${account.code} ${account.name}`,
    },
    context,
  );

  return account;
}

/**
 * An account wired into company settings (receivable, payable, tax, ...) is
 * load-bearing for the posting engine and cannot be archived while in use.
 */
async function assertNotACompanyDefault(
  client: DbClient,
  id: string,
  account: LedgerAccount,
): Promise<void> {
  const settings = await client.companySettings.findUnique({ where: { id: "company" } });
  if (!settings) return;

  const defaults: Record<string, string | null> = {
    receivable: settings.defaultReceivableAccountId,
    payable: settings.defaultPayableAccountId,
    income: settings.defaultIncomeAccountId,
    expense: settings.defaultExpenseAccountId,
    "tax payable": settings.defaultTaxPayableAccountId,
    "input tax": settings.defaultTaxInputAccountId,
  };

  const usedAs = Object.entries(defaults)
    .filter(([, accountId]) => accountId === id)
    .map(([label]) => label);

  if (usedAs.length > 0) {
    throw new ConflictError(
      `${account.code} ${account.name} is the company default ${usedAs.join(" and ")} account. Point the setting at another account before archiving it.`,
    );
  }
}

export async function countAccountReferences(
  id: string,
  client: DbClient = prisma,
): Promise<number> {
  return client.journalItem.count({ where: { accountId: id } });
}

export async function assertAccountDeletable(client: DbClient, id: string): Promise<void> {
  const references = await countAccountReferences(id, client);

  if (references > 0) {
    throw new ValidationError(
      `This account has ${references} posted journal item(s) and cannot be deleted. Archive it instead.`,
    );
  }
}
