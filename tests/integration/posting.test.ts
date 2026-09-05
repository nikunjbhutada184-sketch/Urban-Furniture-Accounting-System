import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEntry, postJournalEntry, reverseJournalEntry } from "@/server/accounting";
import { getTrialBalance } from "@/server/accounting/ledger-service";
import { UnbalancedEntryError } from "@/server/errors";

/**
 * Integration tests for the posting engine against a real PostgreSQL database.
 *
 * These prove the guarantees that unit tests cannot: that the database itself
 * refuses unbalanced, mutated or deleted postings.
 *
 * Skipped unless TEST_DATABASE_URL is set. Run them with:
 *   TEST_DATABASE_URL=postgresql://... npm run test
 * against a database created with `npm run db:deploy && npm run db:seed`.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("posting engine (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  let journalId: string;
  let debtorsId: string;
  let salesId: string;

  beforeAll(async () => {
    const [journal, debtors, sales] = await Promise.all([
      prisma.journal.findUniqueOrThrow({ where: { code: "SAL" } }),
      prisma.ledgerAccount.findUniqueOrThrow({ where: { code: "1100" } }),
      prisma.ledgerAccount.findUniqueOrThrow({ where: { code: "4100" } }),
    ]);

    journalId = journal.id;
    debtorsId = debtors.id;
    salesId = sales.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("posts a balanced entry and writes both items", async () => {
    const entry = await prisma.$transaction((tx) =>
      postJournalEntry(tx, {
        journalId,
        date: new Date("2026-04-15T00:00:00Z"),
        description: "Integration test sale",
        lines: [
          { accountId: debtorsId, debit: "26550.00" },
          { accountId: salesId, credit: "26550.00" },
        ],
      }),
    );

    expect(entry.status).toBe("POSTED");
    expect(entry.totalDebit.toFixed(2)).toBe("26550.00");
    expect(entry.totalCredit.toFixed(2)).toBe("26550.00");

    const items = await prisma.journalItem.findMany({ where: { journalEntryId: entry.id } });
    expect(items).toHaveLength(2);
  });

  it("refuses an unbalanced entry before touching the database", async () => {
    const before = await prisma.journalEntry.count();

    await expect(
      prisma.$transaction((tx) =>
        postJournalEntry(tx, {
          journalId,
          date: new Date("2026-04-15T00:00:00Z"),
          lines: [
            { accountId: debtorsId, debit: "100.00" },
            { accountId: salesId, credit: "90.00" },
          ],
        }),
      ),
    ).rejects.toThrow(UnbalancedEntryError);

    expect(await prisma.journalEntry.count()).toBe(before);
  });

  it("the DATABASE refuses an unbalanced posted entry even when the service is bypassed", async () => {
    // Writing raw rows, deliberately skipping the posting engine. The deferred
    // constraint trigger must reject this at COMMIT.
    await expect(
      prisma.$transaction(async (tx) => {
        const entry = await tx.journalEntry.create({
          data: {
            number: `TEST/BYPASS/${Date.now()}`,
            journalId,
            date: new Date("2026-04-15T00:00:00Z"),
            status: "POSTED",
            totalDebit: "100.00",
            totalCredit: "100.00",
          },
        });

        await tx.journalItem.createMany({
          data: [
            {
              journalEntryId: entry.id,
              accountId: debtorsId,
              debit: "100.00",
              date: new Date("2026-04-15T00:00:00Z"),
              status: "POSTED",
            },
            {
              journalEntryId: entry.id,
              accountId: salesId,
              credit: "90.00", // deliberately wrong
              date: new Date("2026-04-15T00:00:00Z"),
              status: "POSTED",
            },
          ],
        });
      }),
    ).rejects.toThrow(/[Uu]nbalanced/);
  });

  it("the DATABASE refuses to delete a posted entry", async () => {
    const entry = await prisma.$transaction((tx) =>
      postJournalEntry(tx, {
        journalId,
        date: new Date("2026-04-16T00:00:00Z"),
        lines: [
          { accountId: debtorsId, debit: "500.00" },
          { accountId: salesId, credit: "500.00" },
        ],
      }),
    );

    await expect(prisma.journalEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
  });

  it("the DATABASE refuses to modify a posted entry", async () => {
    const entry = await prisma.$transaction((tx) =>
      postJournalEntry(tx, {
        journalId,
        date: new Date("2026-04-17T00:00:00Z"),
        lines: [
          { accountId: debtorsId, debit: "250.00" },
          { accountId: salesId, credit: "250.00" },
        ],
      }),
    );

    await expect(
      prisma.journalEntry.update({
        where: { id: entry.id },
        data: { description: "tampered" },
      }),
    ).rejects.toThrow();
  });

  it("reverses a posted entry with a mirror entry", async () => {
    const original = await prisma.$transaction((tx) =>
      postJournalEntry(tx, {
        journalId,
        date: new Date("2026-04-18T00:00:00Z"),
        lines: [
          { accountId: debtorsId, debit: "1000.00" },
          { accountId: salesId, credit: "1000.00" },
        ],
      }),
    );

    const reversal = await prisma.$transaction((tx) =>
      reverseJournalEntry(tx, original.id, { date: new Date("2026-04-19T00:00:00Z") }),
    );

    expect(reversal.reversalOfId).toBe(original.id);

    const items = await prisma.journalItem.findMany({
      where: { journalEntryId: reversal.id },
      orderBy: { sequence: "asc" },
    });

    // Debits and credits are swapped.
    expect(items[0]?.credit.toFixed(2)).toBe("1000.00");
    expect(items[1]?.debit.toFixed(2)).toBe("1000.00");
  });

  it("keeps the whole ledger in balance", async () => {
    const trialBalance = await getTrialBalance(prisma);

    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.difference.toFixed(2)).toBe("0.00");
    expect(trialBalance.totalDebit.equals(trialBalance.totalCredit)).toBe(true);
  });
});

describe("posting engine (no database required)", () => {
  it("buildEntry is the only gateway to a postable entry", () => {
    expect(() =>
      buildEntry({
        journalId: "j",
        date: new Date(),
        lines: [
          { accountId: "a", debit: "10.00" },
          { accountId: "b", credit: "9.99" },
        ],
      }),
    ).toThrow(UnbalancedEntryError);
  });
});
