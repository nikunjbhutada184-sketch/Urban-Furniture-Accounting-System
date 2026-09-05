import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  budgetPermissions,
  cancelBudget,
  confirmBudget,
  createBudget,
  getBudget,
  getRevisionHistory,
  recomputeBudgetProgress,
  reviseBudget,
  updateBudget,
} from "@/modules/budgets/budget-service";
import { ConflictError } from "@/server/errors";

/**
 * Budget lifecycle and derived figures, against a real database.
 *
 * The achieved amount must always come from the posted ledger -- never from a
 * stored, editable number -- so these tests post a real entry and assert the
 * budget picks it up.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("budgets (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  let incomeAnalyticId: string;
  let expenseAnalyticId: string;

  const periodStart = new Date("2026-04-01T00:00:00Z");
  const periodEnd = new Date("2027-03-31T00:00:00Z");

  beforeAll(async () => {
    const [income, expense] = await Promise.all([
      prisma.analyticAccount.findUniqueOrThrow({ where: { code: "AA-RETAIL" } }),
      prisma.analyticAccount.findUniqueOrThrow({ where: { code: "AA-OPS" } }),
    ]);

    incomeAnalyticId = income.id;
    expenseAnalyticId = expense.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function draftBudget(name: string) {
    return prisma.$transaction((tx) =>
      createBudget(tx, {
        name,
        periodStart,
        periodEnd,
        responsibleUserId: null,
        lines: [
          { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "1000000.00" },
          { analyticAccountId: expenseAnalyticId, accountId: null, plannedAmount: "400000.00" },
        ],
      }),
    );
  }

  it("creates a draft with its lines typed from the analytic account", async () => {
    const budget = await draftBudget(`Budget create ${Date.now()}`);
    const loaded = await getBudget(budget.id, prisma);

    expect(loaded.status).toBe("DRAFT");
    expect(loaded.lines).toHaveLength(2);

    const income = loaded.lines.find((line) => line.analyticAccountId === incomeAnalyticId);
    const expense = loaded.lines.find((line) => line.analyticAccountId === expenseAnalyticId);

    expect(income?.type).toBe("INCOME");
    expect(expense?.type).toBe("EXPENSE");
    // Derived figures start at zero and are never entered by hand.
    expect(income?.achievedAmount.toFixed(2)).toBe("0.00");
    expect(income?.committedAmount.toFixed(2)).toBe("0.00");
  });

  it("refuses two lines for the same analytic account", async () => {
    await expect(
      prisma.$transaction((tx) =>
        createBudget(tx, {
          name: `Duplicate ${Date.now()}`,
          periodStart,
          periodEnd,
          responsibleUserId: null,
          lines: [
            { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "100.00" },
            { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "200.00" },
          ],
        }),
      ),
    ).rejects.toThrow(/only once/);
  });

  it("refuses a period that ends before it starts", async () => {
    await expect(
      prisma.$transaction((tx) =>
        createBudget(tx, {
          name: `Backwards ${Date.now()}`,
          periodStart: periodEnd,
          periodEnd: periodStart,
          responsibleUserId: null,
          lines: [
            { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "100.00" },
          ],
        }),
      ),
    ).rejects.toThrow(/ends before it starts/);
  });

  it("moves DRAFT -> CONFIRMED and locks editing", async () => {
    const budget = await draftBudget(`Budget confirm ${Date.now()}`);

    const confirmed = await prisma.$transaction((tx) => confirmBudget(tx, budget.id));
    expect(confirmed.status).toBe("CONFIRMED");

    // Editing a confirmed budget is refused: it must be revised instead.
    await expect(
      prisma.$transaction((tx) =>
        updateBudget(tx, budget.id, {
          name: "Renamed",
          periodStart,
          periodEnd,
          responsibleUserId: null,
          lines: [
            { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "1.00" },
          ],
        }),
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to confirm anything that is not a draft", async () => {
    const budget = await draftBudget(`Budget double confirm ${Date.now()}`);
    await prisma.$transaction((tx) => confirmBudget(tx, budget.id));

    await expect(
      prisma.$transaction((tx) => confirmBudget(tx, budget.id)),
    ).rejects.toThrow(ConflictError);
  });

  it("revises a confirmed budget, preserving the original", async () => {
    const original = await draftBudget(`Budget revise ${Date.now()}`);
    await prisma.$transaction((tx) => confirmBudget(tx, original.id));

    const revision = await prisma.$transaction((tx) =>
      reviseBudget(tx, original.id, [
        { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "1200000.00" },
        { analyticAccountId: expenseAnalyticId, accountId: null, plannedAmount: "450000.00" },
      ]),
    );

    const reloadedOriginal = await getBudget(original.id, prisma);

    expect(reloadedOriginal.status).toBe("REVISED");
    expect(revision.status).toBe("DRAFT");
    expect(revision.revisionOfId).toBe(original.id);
    expect(revision.name).toMatch(/\(rev 2\)$/);

    // The chain records both versions.
    const history = await getRevisionHistory(revision.id, prisma);
    expect(history.map((entry) => entry.id)).toEqual([original.id, revision.id]);
  });

  it("refuses to revise the same budget twice", async () => {
    const original = await draftBudget(`Budget revise twice ${Date.now()}`);
    await prisma.$transaction((tx) => confirmBudget(tx, original.id));
    await prisma.$transaction((tx) =>
      reviseBudget(tx, original.id, [
        { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "1.00" },
      ]),
    );

    // The original is REVISED now, so revising it again is refused.
    await expect(
      prisma.$transaction((tx) =>
        reviseBudget(tx, original.id, [
          { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "2.00" },
        ]),
      ),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to revise a draft", async () => {
    const budget = await draftBudget(`Budget revise draft ${Date.now()}`);

    await expect(
      prisma.$transaction((tx) =>
        reviseBudget(tx, budget.id, [
          { analyticAccountId: incomeAnalyticId, accountId: null, plannedAmount: "1.00" },
        ]),
      ),
    ).rejects.toThrow(/Only a confirmed budget can be revised/);
  });

  it("cancels a budget and makes it read-only", async () => {
    const budget = await draftBudget(`Budget cancel ${Date.now()}`);
    const cancelled = await prisma.$transaction((tx) => cancelBudget(tx, budget.id));

    expect(cancelled.status).toBe("CANCELLED");
    expect(budgetPermissions(cancelled.status).isReadOnly).toBe(true);

    // A cancelled budget cannot be cancelled again, confirmed or revised.
    await expect(
      prisma.$transaction((tx) => cancelBudget(tx, budget.id)),
    ).rejects.toThrow(ConflictError);
    await expect(
      prisma.$transaction((tx) => confirmBudget(tx, budget.id)),
    ).rejects.toThrow(ConflictError);
  });

  it("derives the achieved amount from posted journal items", async () => {
    const budget = await draftBudget(`Budget achieved ${Date.now()}`);
    await prisma.$transaction((tx) => confirmBudget(tx, budget.id));

    const [journal, cash, income] = await Promise.all([
      prisma.journal.findUniqueOrThrow({ where: { code: "MISC" } }),
      prisma.ledgerAccount.findUniqueOrThrow({ where: { code: "1010" } }),
      prisma.ledgerAccount.findUniqueOrThrow({ where: { code: "4100" } }),
    ]);

    // Measure the delta: the test database accumulates across runs, so an
    // absolute assertion would be run-order dependent.
    await prisma.$transaction((tx) => recomputeBudgetProgress(tx, budget.id));
    const before = await getBudget(budget.id, prisma);
    const beforeAchieved =
      before.lines.find((line) => line.analyticAccountId === incomeAnalyticId)?.achievedAmount ??
      null;

    // Post a real sale tagged with the income analytic account.
    const { postJournalEntry } = await import("@/server/accounting");
    await prisma.$transaction((tx) =>
      postJournalEntry(tx, {
        journalId: journal.id,
        date: new Date("2026-06-15T00:00:00Z"),
        description: "Budget achievement test",
        lines: [
          { accountId: cash.id, debit: "50000.00" },
          { accountId: income.id, credit: "50000.00", analyticAccountId: incomeAnalyticId },
        ],
      }),
    );

    await prisma.$transaction((tx) => recomputeBudgetProgress(tx, budget.id));

    const loaded = await getBudget(budget.id, prisma);
    const incomeLine = loaded.lines.find(
      (line) => line.analyticAccountId === incomeAnalyticId,
    );

    // Income counts credit - debit, so the sale reads as positive progress.
    expect(incomeLine).toBeDefined();
    expect(
      incomeLine!.achievedAmount.minus(beforeAchieved ?? 0).toFixed(2),
    ).toBe("50000.00");
  });

  it("exposes the status rules the UI uses to enable actions", () => {
    expect(budgetPermissions("DRAFT")).toMatchObject({
      canEdit: true,
      canConfirm: true,
      canRevise: false,
      canCancel: true,
    });
    expect(budgetPermissions("CONFIRMED")).toMatchObject({
      canEdit: false,
      canConfirm: false,
      canRevise: true,
      canCancel: true,
    });
    expect(budgetPermissions("REVISED")).toMatchObject({ isReadOnly: true });
    expect(budgetPermissions("CANCELLED")).toMatchObject({ isReadOnly: true });
  });
});
