import { EntryStatus, type JournalEntry } from "@prisma/client";
import { type DbClient } from "@/server/db/prisma";
import {
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
  PeriodLockedError,
} from "@/server/errors";
import { SEQUENCE_CODES, nextNumber } from "@/server/sequence/sequence-service";
import { buildEntry } from "./balance";
import { type JournalEntryDraft, type PostingContext } from "./types";

/**
 * The posting engine.
 *
 * This module is the ONLY code permitted to write `journal_entries` and
 * `journal_items`. Every document that touches the books (vendor bill,
 * customer invoice, payment, manual entry) funnels through `postJournalEntry`.
 *
 * All functions take the caller's transaction client so that posting composes
 * atomically with the document update that triggered it.
 */

/** Truncates a date to midnight UTC, matching the `@db.Date` columns. */
export function toAccountingDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Rejects entries dated inside a closed period. Called before any write.
 */
export async function assertPeriodOpen(tx: DbClient, date: Date): Promise<void> {
  const settings = await tx.companySettings.findUnique({
    where: { id: "company" },
    select: { lockDate: true },
  });

  const lockDate = settings?.lockDate;
  if (!lockDate) return;

  const entryDate = toAccountingDate(date);
  if (entryDate.getTime() <= toAccountingDate(lockDate).getTime()) {
    throw new PeriodLockedError(
      entryDate.toISOString().slice(0, 10),
      toAccountingDate(lockDate).toISOString().slice(0, 10),
    );
  }
}

/**
 * Validates a draft and writes it to the ledger as a POSTED entry.
 *
 * Ordering matters and is deliberate:
 *   1. `buildEntry` proves the entry balances -- nothing is written if it does not.
 *   2. The period lock is checked.
 *   3. A document number is consumed from the sequence (inside this transaction).
 *   4. The entry and its items are inserted in one statement.
 *
 * @throws UnbalancedEntryError    debits !== credits
 * @throws InvalidJournalLineError a line is malformed
 * @throws PeriodLockedError       the accounting period is closed
 */
export async function postJournalEntry(
  tx: DbClient,
  draft: JournalEntryDraft,
  context: PostingContext = {},
  options: { reversalOfId?: string } = {},
): Promise<JournalEntry> {
  // 1. Prove it balances before anything else happens.
  const balanced = buildEntry(draft);

  const journal = await tx.journal.findUnique({
    where: { id: draft.journalId },
    select: { id: true, sequenceCode: true, isArchived: true },
  });

  if (!journal) throw new NotFoundError("Journal", draft.journalId);
  if (journal.isArchived) {
    throw new ConflictError("Cannot post to an archived journal.");
  }

  const date = toAccountingDate(draft.date);

  // 2. Closed period guard.
  await assertPeriodOpen(tx, date);

  // 3. Consume a number from this journal's sequence.
  const number = await nextNumber(tx, journal.sequenceCode ?? SEQUENCE_CODES.JOURNAL_ENTRY);

  // 4. Write the entry and its items together.
  return tx.journalEntry.create({
    data: {
      number,
      journalId: journal.id,
      date,
      reference: draft.reference ?? null,
      description: draft.description ?? null,
      status: EntryStatus.POSTED,
      totalDebit: balanced.totalDebit,
      totalCredit: balanced.totalCredit,
      sourceType: draft.sourceType ?? null,
      sourceId: draft.sourceId ?? null,
      reversalOfId: options.reversalOfId ?? null,
      createdById: context.userId ?? null,
      postedById: context.userId ?? null,
      postedAt: new Date(),
      items: {
        create: balanced.lines.map((line) => ({
          accountId: line.accountId,
          contactId: line.contactId,
          analyticAccountId: line.analyticAccountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          date,
          status: EntryStatus.POSTED,
          sequence: line.sequence,
        })),
      },
    },
  });
}

/**
 * Saves an entry without posting it. Draft entries may be unbalanced while
 * being edited, so `buildEntry` is intentionally not called here -- the
 * balance check happens when the draft is posted.
 */
export async function createDraftEntry(
  tx: DbClient,
  draft: JournalEntryDraft,
  context: PostingContext = {},
): Promise<JournalEntry> {
  const journal = await tx.journal.findUnique({
    where: { id: draft.journalId },
    select: { id: true, sequenceCode: true },
  });
  if (!journal) throw new NotFoundError("Journal", draft.journalId);

  const date = toAccountingDate(draft.date);
  const number = await nextNumber(tx, journal.sequenceCode ?? SEQUENCE_CODES.JOURNAL_ENTRY);

  return tx.journalEntry.create({
    data: {
      number,
      journalId: journal.id,
      date,
      reference: draft.reference ?? null,
      description: draft.description ?? null,
      status: EntryStatus.DRAFT,
      totalDebit: 0,
      totalCredit: 0,
      sourceType: draft.sourceType ?? null,
      sourceId: draft.sourceId ?? null,
      createdById: context.userId ?? null,
      items: {
        create: draft.lines.map((line, index) => ({
          accountId: line.accountId,
          contactId: line.contactId ?? null,
          analyticAccountId: line.analyticAccountId ?? null,
          description: line.description ?? null,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
          date,
          status: EntryStatus.DRAFT,
          sequence: index,
        })),
      },
    },
  });
}

/**
 * Posts an existing DRAFT entry. The draft's items are re-validated through
 * `buildEntry`, so a draft that was saved unbalanced simply cannot be posted.
 */
export async function postDraftEntry(
  tx: DbClient,
  entryId: string,
  context: PostingContext = {},
): Promise<JournalEntry> {
  const entry = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { items: { orderBy: { sequence: "asc" } } },
  });

  if (!entry) throw new NotFoundError("Journal entry", entryId);
  if (entry.status !== EntryStatus.DRAFT) {
    throw new InvalidStateTransitionError("journal entry", entry.status, EntryStatus.POSTED);
  }

  const balanced = buildEntry({
    journalId: entry.journalId,
    date: entry.date,
    lines: entry.items.map((item) => ({
      accountId: item.accountId,
      debit: item.debit,
      credit: item.credit,
      description: item.description,
      contactId: item.contactId,
      analyticAccountId: item.analyticAccountId,
    })),
  });

  await assertPeriodOpen(tx, entry.date);

  // Items are updated before the entry so each item's own immutability trigger
  // (which fires on `OLD.status = POSTED`) still sees a draft row.
  await tx.journalItem.updateMany({
    where: { journalEntryId: entry.id },
    data: { status: EntryStatus.POSTED },
  });

  return tx.journalEntry.update({
    where: { id: entry.id },
    data: {
      status: EntryStatus.POSTED,
      totalDebit: balanced.totalDebit,
      totalCredit: balanced.totalCredit,
      postedById: context.userId ?? null,
      postedAt: new Date(),
    },
  });
}

/**
 * Corrects a posted entry by posting its mirror image.
 *
 * A posted entry is never edited or deleted (the database refuses both), so a
 * reversal is the only correction mechanism. The reversal is linked to the
 * original via `reversalOfId`, keeping a complete audit trail.
 */
export async function reverseJournalEntry(
  tx: DbClient,
  entryId: string,
  options: { date?: Date; reason?: string } = {},
  context: PostingContext = {},
): Promise<JournalEntry> {
  const entry = await tx.journalEntry.findUnique({
    where: { id: entryId },
    include: { items: { orderBy: { sequence: "asc" } }, reversedBy: { select: { id: true } } },
  });

  if (!entry) throw new NotFoundError("Journal entry", entryId);
  if (entry.status !== EntryStatus.POSTED) {
    throw new InvalidStateTransitionError("journal entry", entry.status, "REVERSED");
  }
  if (entry.reversedBy) {
    throw new ConflictError(`Journal entry ${entry.number} has already been reversed.`);
  }

  const reversalDate = toAccountingDate(options.date ?? new Date());
  await assertPeriodOpen(tx, reversalDate);

  // Swap every debit and credit. The mirror of a balanced entry balances, so
  // buildEntry inside postJournalEntry will always accept it.
  const draft: JournalEntryDraft = {
    journalId: entry.journalId,
    date: reversalDate,
    reference: entry.number,
    description: options.reason ?? `Reversal of ${entry.number}`,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    lines: entry.items.map((item) => ({
      accountId: item.accountId,
      debit: item.credit,
      credit: item.debit,
      description: item.description,
      contactId: item.contactId,
      analyticAccountId: item.analyticAccountId,
    })),
  };

  // `reversalOfId` is set at INSERT time: a posted entry can never be updated
  // afterwards, because the database trigger refuses it.
  return postJournalEntry(tx, draft, context, { reversalOfId: entry.id });
}
