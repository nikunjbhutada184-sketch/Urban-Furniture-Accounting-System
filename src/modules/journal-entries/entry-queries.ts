import { EntryStatus, type Prisma } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { type DbClient, prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/errors";
import { toAmountString } from "@/server/money";

/**
 * Journal entry read models.
 *
 * Entries are written only by the accounting engine; this module reads them for
 * the accounting screens.
 */

export const ENTRY_SORT_FIELDS = ["date", "number", "totalDebit"] as const;
export type EntrySortField = (typeof ENTRY_SORT_FIELDS)[number];

export const ENTRY_STATUS_OPTIONS = [
  { value: EntryStatus.POSTED, label: "Posted" },
  { value: EntryStatus.DRAFT, label: "Draft" },
  { value: EntryStatus.CANCELLED, label: "Cancelled" },
] as const;

export interface EntryListRow {
  id: string;
  number: string;
  date: Date;
  journalCode: string;
  journalName: string;
  reference: string | null;
  description: string | null;
  status: EntryStatus;
  total: string;
  itemCount: number;
  sourceType: string | null;
  sourceId: string | null;
}

export async function listJournalEntries(
  params: ListParams<EntrySortField>,
  client: DbClient = prisma,
): Promise<{ rows: EntryListRow[]; total: number }> {
  const where: Prisma.JournalEntryWhereInput = {};

  if (params.filters.status) where.status = params.filters.status as EntryStatus;
  if (params.filters.journal) where.journalId = params.filters.journal;

  if (params.search) {
    where.OR = [
      { number: { contains: params.search, mode: "insensitive" } },
      { reference: { contains: params.search, mode: "insensitive" } },
      { description: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.journalEntry.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        number: true,
        date: true,
        reference: true,
        description: true,
        status: true,
        totalDebit: true,
        sourceType: true,
        sourceId: true,
        journal: { select: { code: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    client.journalEntry.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      number: record.number,
      date: record.date,
      journalCode: record.journal.code,
      journalName: record.journal.name,
      reference: record.reference,
      description: record.description,
      status: record.status,
      total: toAmountString(record.totalDebit),
      itemCount: record._count.items,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
    })),
  };
}

export async function getJournalEntry(id: string, client: DbClient = prisma) {
  const entry = await client.journalEntry.findUnique({
    where: { id },
    include: {
      journal: { select: { id: true, code: true, name: true } },
      createdBy: { select: { name: true } },
      postedBy: { select: { name: true } },
      reversalOf: { select: { id: true, number: true } },
      reversedBy: { select: { id: true, number: true } },
      items: {
        orderBy: { sequence: "asc" },
        include: {
          account: { select: { id: true, code: true, name: true } },
          contact: { select: { id: true, name: true } },
          analyticAccount: { select: { code: true, name: true } },
        },
      },
    },
  });

  if (!entry) throw new NotFoundError("Journal entry", id);
  return entry;
}

/** Links an entry back to the document that produced it. */
export function entrySourceHref(
  sourceType: string | null,
  sourceId: string | null,
): string | null {
  if (!sourceType || !sourceId) return null;

  switch (sourceType) {
    case "CustomerInvoice":
      return `/sales/invoices/${sourceId}`;
    case "VendorBill":
      return `/purchases/bills/${sourceId}`;
    case "Payment":
      return `/payments/${sourceId}`;
    default:
      return null;
  }
}
