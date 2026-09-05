import type { Journal, JournalType, Prisma } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { archiveWhere, searchWhere } from "@/modules/shared/list-filters";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { type JournalInput, type JournalSortField } from "./schemas";

/**
 * Journal master data service.
 *
 * Journals are referenced by every posted entry, so they are archived rather
 * than deleted. An archived journal can no longer be posted to -- the posting
 * engine refuses it.
 */

export interface JournalListRow {
  id: string;
  code: string;
  name: string;
  type: JournalType;
  defaultDebitLabel: string | null;
  defaultCreditLabel: string | null;
  paymentAccountLabel: string | null;
  entryCount: number;
  isArchived: boolean;
}

function label(account: { code: string; name: string } | null): string | null {
  return account ? `${account.code} · ${account.name}` : null;
}

function buildWhere(params: ListParams<JournalSortField>): Prisma.JournalWhereInput {
  const where: Prisma.JournalWhereInput = { ...archiveWhere(params.filters.status) };

  if (params.filters.type) where.type = params.filters.type as JournalType;
  if (params.search) Object.assign(where, searchWhere(params.search, ["code", "name"]));

  return where;
}

export async function listJournals(
  params: ListParams<JournalSortField>,
  client: DbClient = prisma,
): Promise<{ rows: JournalListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.journal.findMany({
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
        defaultDebitAccount: { select: { code: true, name: true } },
        defaultCreditAccount: { select: { code: true, name: true } },
        paymentAccount: { select: { code: true, name: true } },
        _count: { select: { entries: true } },
      },
    }),
    client.journal.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      code: record.code,
      name: record.name,
      type: record.type,
      defaultDebitLabel: label(record.defaultDebitAccount),
      defaultCreditLabel: label(record.defaultCreditAccount),
      paymentAccountLabel: label(record.paymentAccount),
      entryCount: record._count.entries,
      isArchived: record.isArchived,
    })),
  };
}

export async function getJournal(id: string, client: DbClient = prisma): Promise<Journal> {
  const journal = await client.journal.findUnique({ where: { id } });
  if (!journal) throw new NotFoundError("Journal", id);
  return journal;
}

/** Journals of a given type that can currently be posted to. */
export async function listJournalOptions(types?: JournalType[], client: DbClient = prisma) {
  return client.journal.findMany({
    where: { isArchived: false, ...(types ? { type: { in: types } } : {}) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true, paymentAccountId: true },
  });
}

async function assertCodeAvailable(
  client: DbClient,
  code: string,
  excludeId?: string,
): Promise<void> {
  const existing = await client.journal.findFirst({
    where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Journal code "${code}" is already in use.`, {
      fieldErrors: { code: "This journal code is already in use." },
    });
  }
}

function toJournalData(input: JournalInput) {
  return {
    code: input.code,
    name: input.name,
    type: input.type,
    defaultDebitAccountId: input.defaultDebitAccountId,
    defaultCreditAccountId: input.defaultCreditAccountId,
    paymentAccountId: input.paymentAccountId,
    // Falls back to the generic journal-entry series when none is chosen.
    sequenceCode: input.sequenceCode ?? "journal_entry",
  };
}

export async function createJournal(
  tx: DbClient,
  input: JournalInput,
  context: { userId?: string | null } = {},
): Promise<Journal> {
  await assertCodeAvailable(tx, input.code);

  const journal = await tx.journal.create({ data: toJournalData(input) });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "Journal",
      entityId: journal.id,
      summary: `Created journal ${journal.code} ${journal.name}`,
    },
    context,
  );

  return journal;
}

export async function updateJournal(
  tx: DbClient,
  id: string,
  input: JournalInput,
  context: { userId?: string | null } = {},
): Promise<Journal> {
  const existing = await getJournal(id, tx);
  await assertCodeAvailable(tx, input.code, id);

  // Retyping a journal would reclassify every entry already posted to it.
  if (existing.type !== input.type) {
    const entries = await tx.journalEntry.count({ where: { journalId: id } });

    if (entries > 0) {
      throw new ConflictError(
        `${existing.name} already has ${entries} entr${entries === 1 ? "y" : "ies"}. Its type cannot be changed.`,
        { fieldErrors: { type: "Cannot change the type of a journal that has entries." } },
      );
    }
  }

  const journal = await tx.journal.update({ where: { id }, data: toJournalData(input) });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "Journal",
      entityId: id,
      summary: `Updated journal ${journal.code} ${journal.name}`,
    },
    context,
  );

  return journal;
}

export async function setJournalArchived(
  tx: DbClient,
  id: string,
  isArchived: boolean,
  context: { userId?: string | null } = {},
): Promise<Journal> {
  const existing = await getJournal(id, tx);
  if (existing.isArchived === isArchived) return existing;

  if (isArchived) {
    // Draft documents still pointing at this journal could never be posted.
    const [draftBills, draftInvoices, draftPayments] = await Promise.all([
      tx.vendorBill.count({ where: { journalId: id, status: "DRAFT" } }),
      tx.customerInvoice.count({ where: { journalId: id, status: "DRAFT" } }),
      tx.payment.count({ where: { journalId: id, status: "DRAFT" } }),
    ]);

    const open = draftBills + draftInvoices + draftPayments;
    if (open > 0) {
      throw new ConflictError(
        `${existing.name} is used by ${open} draft document(s). Post or cancel them before archiving this journal.`,
      );
    }
  }

  const journal = await tx.journal.update({ where: { id }, data: { isArchived } });

  await recordAudit(
    tx,
    {
      action: isArchived ? "archive" : "restore",
      entity: "Journal",
      entityId: id,
      summary: `${isArchived ? "Archived" : "Restored"} journal ${journal.code} ${journal.name}`,
    },
    context,
  );

  return journal;
}

export async function countJournalReferences(
  id: string,
  client: DbClient = prisma,
): Promise<number> {
  return client.journalEntry.count({ where: { journalId: id } });
}

export async function assertJournalDeletable(client: DbClient, id: string): Promise<void> {
  const references = await countJournalReferences(id, client);

  if (references > 0) {
    throw new ValidationError(
      `This journal has ${references} posted entr${references === 1 ? "y" : "ies"} and cannot be deleted. Archive it instead.`,
    );
  }
}
