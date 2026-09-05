import { AccountType, EntryStatus, type Prisma } from "@prisma/client";
import { type DbClient, prisma } from "@/server/db/prisma";
import { type Decimal, ZERO, subtract, sum, toMoney } from "@/server/money";
import { type AccountBalance, type LedgerQuery } from "./types";

/**
 * Ledger queries -- the single primitive every financial report is built on.
 *
 * Only POSTED items are ever considered: drafts and cancelled entries do not
 * exist as far as reporting is concerned. Aggregation happens in Postgres, not
 * in JavaScript, so these queries stay flat as the ledger grows.
 */

/** Account types whose natural balance is a credit. */
const CREDIT_NATURED: ReadonlySet<AccountType> = new Set([
  AccountType.LIABILITY,
  AccountType.CAPITAL,
  AccountType.INCOME,
]);

/**
 * Converts the stored signed balance (`debit - credit`) into the amount a
 * reader expects to see for that account type: positive means "more of what
 * this account naturally holds".
 *
 * Presentation only. Never feed the result back into a ledger calculation.
 */
export function naturalBalance(type: AccountType, signedBalance: Decimal): Decimal {
  return CREDIT_NATURED.has(type) ? signedBalance.negated() : signedBalance;
}

function itemFilter(query: LedgerQuery): Prisma.JournalItemWhereInput {
  const where: Prisma.JournalItemWhereInput = { status: EntryStatus.POSTED };

  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.accountIds?.length) where.accountId = { in: query.accountIds };
  if (query.analyticAccountId) where.analyticAccountId = query.analyticAccountId;
  if (query.contactId) where.contactId = query.contactId;

  return where;
}

/**
 * Total debits and credits per account for a period.
 *
 * This is THE reporting primitive: the trial balance, balance sheet and P&L are
 * all thin projections over it. If reporting ever needs to be backed by a
 * materialised balance table, only this function changes.
 */
export async function getAccountBalances(
  client: DbClient = prisma,
  query: LedgerQuery = {},
): Promise<AccountBalance[]> {
  const grouped = await client.journalItem.groupBy({
    by: ["accountId"],
    where: itemFilter(query),
    _sum: { debit: true, credit: true },
  });

  if (grouped.length === 0) return [];

  const accounts = await client.ledgerAccount.findMany({
    where: { id: { in: grouped.map((row) => row.accountId) } },
    select: { id: true, code: true, name: true, type: true, parentId: true },
  });

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  return grouped
    .flatMap<AccountBalance>((row) => {
      const meta = accountById.get(row.accountId);
      if (!meta) return [];

      const debit = toMoney(row._sum.debit ?? 0);
      const credit = toMoney(row._sum.credit ?? 0);

      return [
        {
          accountId: row.accountId,
          code: meta.code,
          name: meta.name,
          type: meta.type,
          parentId: meta.parentId,
          debit,
          credit,
          balance: subtract(debit, credit),
        },
      ];
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Trial balance: every account's movement plus the grand totals.
 *
 * `isBalanced` is a health check on the whole ledger. It must always be true;
 * if it is not, something has bypassed the posting engine.
 */
export async function getTrialBalance(
  client: DbClient = prisma,
  query: LedgerQuery = {},
): Promise<{
  rows: AccountBalance[];
  totalDebit: Decimal;
  totalCredit: Decimal;
  difference: Decimal;
  isBalanced: boolean;
}> {
  const rows = await getAccountBalances(client, query);
  const totalDebit = sum(rows.map((r) => r.debit));
  const totalCredit = sum(rows.map((r) => r.credit));
  const difference = subtract(totalDebit, totalCredit);

  return {
    rows,
    totalDebit,
    totalCredit,
    difference,
    isBalanced: difference.isZero(),
  };
}

/**
 * Opening balance for an account: the signed balance of everything posted
 * strictly before `date`.
 */
export async function getOpeningBalance(
  client: DbClient = prisma,
  accountId: string,
  date: Date,
): Promise<Decimal> {
  const aggregate = await client.journalItem.aggregate({
    where: { accountId, status: EntryStatus.POSTED, date: { lt: date } },
    _sum: { debit: true, credit: true },
  });

  return subtract(toMoney(aggregate._sum.debit ?? 0), toMoney(aggregate._sum.credit ?? 0));
}

export interface LedgerLine {
  itemId: string;
  entryId: string;
  entryNumber: string;
  date: Date;
  journalCode: string;
  description: string | null;
  contactName: string | null;
  debit: Decimal;
  credit: Decimal;
  /** Signed balance after this line. */
  runningBalance: Decimal;
}

/**
 * Account statement (general ledger): every posted movement on one account in
 * date order, with a running balance carried forward from the opening balance.
 */
export async function getAccountStatement(
  client: DbClient = prisma,
  accountId: string,
  query: Omit<LedgerQuery, "accountIds"> = {},
): Promise<{ openingBalance: Decimal; lines: LedgerLine[]; closingBalance: Decimal }> {
  const openingBalance = query.from ? await getOpeningBalance(client, accountId, query.from) : ZERO;

  const items = await client.journalItem.findMany({
    where: itemFilter({ ...query, accountIds: [accountId] }),
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { sequence: "asc" }],
    select: {
      id: true,
      journalEntryId: true,
      date: true,
      description: true,
      debit: true,
      credit: true,
      contact: { select: { name: true } },
      journalEntry: { select: { number: true, journal: { select: { code: true } } } },
    },
  });

  let running = openingBalance;
  const lines = items.map<LedgerLine>((item) => {
    const debit = toMoney(item.debit);
    const credit = toMoney(item.credit);
    running = subtract(running.plus(debit), credit);

    return {
      itemId: item.id,
      entryId: item.journalEntryId,
      entryNumber: item.journalEntry.number,
      date: item.date,
      journalCode: item.journalEntry.journal.code,
      description: item.description,
      contactName: item.contact?.name ?? null,
      debit,
      credit,
      runningBalance: running,
    };
  });

  return { openingBalance, lines, closingBalance: running };
}

/**
 * Outstanding balance per contact on the reconcilable (receivable/payable)
 * accounts. Backs the partner ledger and ageing reports.
 */
export async function getContactBalances(
  client: DbClient = prisma,
  options: { accountKind: "RECEIVABLE" | "PAYABLE"; asAt?: Date } = { accountKind: "RECEIVABLE" },
): Promise<Array<{ contactId: string; balance: Decimal }>> {
  const accounts = await client.ledgerAccount.findMany({
    where: { kind: options.accountKind },
    select: { id: true },
  });

  if (accounts.length === 0) return [];

  const grouped = await client.journalItem.groupBy({
    by: ["contactId"],
    where: {
      status: EntryStatus.POSTED,
      accountId: { in: accounts.map((a) => a.id) },
      contactId: { not: null },
      ...(options.asAt ? { date: { lte: options.asAt } } : {}),
    },
    _sum: { debit: true, credit: true },
  });

  return grouped.flatMap((row) =>
    row.contactId
      ? [
          {
            contactId: row.contactId,
            balance: subtract(toMoney(row._sum.debit ?? 0), toMoney(row._sum.credit ?? 0)),
          },
        ]
      : [],
  );
}
