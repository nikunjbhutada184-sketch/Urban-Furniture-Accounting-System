import { EntryStatus, type JournalEntry } from "@prisma/client";
import { type DbClient, prisma } from "@/server/db/prisma";
import { InvalidJournalLineError, NotFoundError } from "@/server/errors";
import { type Decimal, ZERO, subtract, toAmountString, toMoney } from "@/server/money";
import { buildEntry } from "./balance";
import {
  getAccountBalances,
  getAccountStatement,
  getOpeningBalance,
  getTrialBalance,
} from "./ledger-service";
import {
  createDraftEntry,
  postDraftEntry,
  postJournalEntry as postEntry,
  reverseJournalEntry,
} from "./posting-service";
import { type JournalEntryDraft, type LedgerQuery, type PostingContext } from "./types";

/**
 * AccountingService -- the domain layer for double-entry accounting.
 *
 * Every module that touches the books calls these functions. No module
 * duplicates posting logic, computes a ledger balance itself, or writes
 * `journal_entries` / `journal_items` directly.
 *
 * THE RULE: for every posted journal entry, SUM(debits) === SUM(credits),
 * compared as exact decimals. It is enforced here, again by database CHECK
 * constraints and deferred triggers, and pinned by tests.
 */

export interface ValidationResult {
  valid: boolean;
  totalDebit: string;
  totalCredit: string;
  difference: string;
  errors: string[];
}

/**
 * Full validation of a draft: structure, balance, and that every referenced
 * account actually exists and is usable.
 *
 * `buildEntry` covers the arithmetic (it is pure and needs no database); this
 * adds the checks that require one. Returns a report rather than throwing, so
 * a form can show every problem at once.
 */
export async function validateJournalEntry(
  client: DbClient,
  draft: JournalEntryDraft,
): Promise<ValidationResult> {
  const errors: string[] = [];
  let totalDebit = ZERO;
  let totalCredit = ZERO;

  // 1. Structure and balance.
  try {
    const balanced = buildEntry(draft);
    totalDebit = balanced.totalDebit;
    totalCredit = balanced.totalCredit;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid journal entry.");

    // Still report the sums so the user can see how far off they are.
    for (const line of draft.lines ?? []) {
      try {
        totalDebit = totalDebit.plus(toMoney(line.debit ?? 0));
        totalCredit = totalCredit.plus(toMoney(line.credit ?? 0));
      } catch {
        // A malformed amount is already reported above.
      }
    }
  }

  // 2. The journal must exist and be open.
  if (!draft.journalId) {
    errors.push("A journal must be selected.");
  } else {
    const journal = await client.journal.findUnique({
      where: { id: draft.journalId },
      select: { id: true, isArchived: true, name: true },
    });
    if (!journal) errors.push(`Journal '${draft.journalId}' does not exist.`);
    else if (journal.isArchived) errors.push(`Journal '${journal.name}' is archived.`);
  }

  // 3. A date is required and must be a real date.
  if (!draft.date || Number.isNaN(new Date(draft.date).getTime())) {
    errors.push("A valid entry date is required.");
  }

  // 4. Every referenced account must exist and be usable.
  const accountIds = [
    ...new Set((draft.lines ?? []).map((line) => line.accountId).filter(Boolean)),
  ];

  if (accountIds.length > 0) {
    const accounts = await client.ledgerAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, code: true, name: true, isArchived: true },
    });

    const byId = new Map(accounts.map((account) => [account.id, account]));

    for (const accountId of accountIds) {
      const account = byId.get(accountId);
      if (!account) {
        errors.push(`Account '${accountId}' does not exist.`);
      } else if (account.isArchived) {
        errors.push(`Account ${account.code} ${account.name} is archived and cannot be posted to.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    totalDebit: toAmountString(totalDebit),
    totalCredit: toAmountString(totalCredit),
    difference: toAmountString(subtract(totalDebit, totalCredit)),
    errors,
  };
}

/**
 * Throwing form of {@link validateJournalEntry}, used on the posting path.
 * `buildEntry` runs first so a balance failure produces the precise
 * `UnbalancedEntryError` rather than a generic list.
 */
export async function assertJournalEntryValid(
  client: DbClient,
  draft: JournalEntryDraft,
): Promise<void> {
  buildEntry(draft);

  const accountIds = [...new Set(draft.lines.map((line) => line.accountId))];
  const accounts = await client.ledgerAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, code: true, name: true, isArchived: true },
  });

  const byId = new Map(accounts.map((account) => [account.id, account]));

  for (const accountId of accountIds) {
    const account = byId.get(accountId);
    if (!account) throw new NotFoundError("Ledger account", accountId);
    if (account.isArchived) {
      throw new InvalidJournalLineError(
        `Account ${account.code} ${account.name} is archived and cannot be posted to.`,
      );
    }
  }
}

/**
 * Creates a journal entry as a DRAFT. Drafts may be unbalanced while being
 * edited; they are validated again on posting and cannot reach the ledger
 * unbalanced.
 */
export async function createJournalEntry(
  tx: DbClient,
  draft: JournalEntryDraft,
  context: PostingContext = {},
): Promise<JournalEntry> {
  return createDraftEntry(tx, draft, context);
}

/**
 * Validates and posts an entry to the ledger in one atomic step.
 *
 * Nothing is written unless the entry balances and every account is valid.
 * Must be called inside a transaction (`withTransaction`) so that the document
 * update that triggered the posting rolls back with it.
 */
export async function postJournalEntry(
  tx: DbClient,
  draft: JournalEntryDraft,
  context: PostingContext = {},
): Promise<JournalEntry> {
  await assertJournalEntryValid(tx, draft);
  return postEntry(tx, draft, context);
}

/**
 * Signed balance of a single account (`debit - credit`) over an optional period.
 */
export async function getAccountBalance(
  client: DbClient = prisma,
  accountId: string,
  query: Omit<LedgerQuery, "accountIds"> = {},
): Promise<Decimal> {
  const aggregate = await client.journalItem.aggregate({
    where: {
      accountId,
      status: EntryStatus.POSTED,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.analyticAccountId ? { analyticAccountId: query.analyticAccountId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
    },
    _sum: { debit: true, credit: true },
  });

  return subtract(toMoney(aggregate._sum.debit ?? 0), toMoney(aggregate._sum.credit ?? 0));
}

/**
 * Every posted movement on an account with a running balance -- the general
 * ledger view of a single account.
 */
export const getAccountLedger = getAccountStatement;

/**
 * The accounting domain layer, gathered into one object.
 *
 * Import the named functions directly, or this facade when a module wants the
 * whole surface (`AccountingService.postJournalEntry(...)`).
 */
export const AccountingService = {
  createJournalEntry,
  validateJournalEntry,
  assertJournalEntryValid,
  postJournalEntry,
  postDraftEntry,
  reverseJournalEntry,
  getAccountLedger,
  getAccountBalance,
  getAccountBalances,
  getOpeningBalance,
  getTrialBalance,
} as const;
