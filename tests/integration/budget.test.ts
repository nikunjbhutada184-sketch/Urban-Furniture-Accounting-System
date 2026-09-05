import { PrismaClient, BudgetStatus, AnalyticAccountType, EntryStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { 
  createBudget, 
  confirmBudget, 
  reviseBudget, 
  cancelBudget, 
  syncBudgetAchievement 
} from "@/modules/budgets/budget-service";
import { Decimal } from "@prisma/client/runtime/library";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("Budget Management module (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  
  let analyticAccountId: string;
  let ledgerAccountId: string;

  beforeAll(async () => {
    // Create dependencies
    const analytic = await prisma.analyticAccount.create({
      data: {
        code: `TEST-BUDGET-${Date.now()}`,
        name: "Test Analytic Account",
        type: AnalyticAccountType.EXPENSE,
      }
    });
    analyticAccountId = analytic.id;

    // Use an existing ledger account or create a dummy one if required
    // (Here we just omit accountId in our budget lines to test the broad analytic scope)
  });

  afterAll(async () => {
    // Cleanup
    await prisma.budgetLine.deleteMany({ where: { analyticAccountId } });
    await prisma.budget.deleteMany({ where: { name: { contains: "Test Budget" } } });
    await prisma.journalItem.deleteMany({ where: { analyticAccountId } });
    await prisma.journalEntry.deleteMany({ where: { description: { contains: "Test Entry" } } });
    await prisma.analyticAccount.delete({ where: { id: analyticAccountId } });
    await prisma.$disconnect();
  });

  it("handles the budget lifecycle (draft -> confirm -> revise -> cancel)", async () => {
    // 1. Create
    let budget = await prisma.$transaction((tx) => 
      createBudget(tx, {
        name: "Test Budget 1",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-12-31T23:59:59Z"),
        lines: [
          { analyticAccountId, plannedAmount: 1000 }
        ]
      })
    );

    expect(budget.status).toBe(BudgetStatus.DRAFT);
    expect(budget.lines.length).toBe(1);
    expect(budget.lines[0].plannedAmount.toNumber()).toBe(1000);

    // 2. Confirm
    await prisma.$transaction((tx) => confirmBudget(tx, budget.id));
    let confirmedBudget = await prisma.budget.findUniqueOrThrow({ where: { id: budget.id } });
    expect(confirmedBudget.status).toBe(BudgetStatus.CONFIRMED);

    // 3. Revise
    const revisedBudget = await prisma.$transaction((tx) => 
      reviseBudget(tx, budget.id, [
        { analyticAccountId, plannedAmount: 1500 }
      ])
    );

    expect(revisedBudget.status).toBe(BudgetStatus.DRAFT);
    expect(revisedBudget.name).toBe("Test Budget 1 Revised");
    expect(revisedBudget.revisionOfId).toBe(budget.id);

    // The original budget should now be REVISED
    const oldBudget = await prisma.budget.findUniqueOrThrow({ where: { id: budget.id } });
    expect(oldBudget.status).toBe(BudgetStatus.REVISED);

    // 4. Cancel
    await prisma.$transaction((tx) => cancelBudget(tx, revisedBudget.id));
    const cancelledBudget = await prisma.budget.findUniqueOrThrow({ where: { id: revisedBudget.id } });
    expect(cancelledBudget.status).toBe(BudgetStatus.CANCELLED);
  });

  it("calculates achieved amount from journal items", async () => {
    // Create a new budget
    const budget = await prisma.$transaction((tx) => 
      createBudget(tx, {
        name: "Test Budget Actuals",
        periodStart: new Date("2026-01-01T00:00:00Z"),
        periodEnd: new Date("2026-12-31T23:59:59Z"),
        lines: [
          { analyticAccountId, plannedAmount: 5000 }
        ]
      })
    );

    await prisma.$transaction((tx) => confirmBudget(tx, budget.id));

    // Create a POSTED journal entry simulating an expense mapped to this analytic account
    const journal = await prisma.journal.findFirstOrThrow({ where: { type: "MISCELLANEOUS" } });
    const dummyAccount = await prisma.ledgerAccount.findFirstOrThrow({ where: { type: "EXPENSE" } });
    const dummyAccountCredit = await prisma.ledgerAccount.findFirstOrThrow({ where: { type: "CURRENT_ASSET" } });
    
    // Create an entry
    const entry = await prisma.journalEntry.create({
      data: {
        number: `TEST-ENTRY-${Date.now()}`,
        journalId: journal.id,
        date: new Date("2026-06-15T00:00:00Z"),
        description: "Test Entry for Budget",
        status: EntryStatus.POSTED,
        totalDebit: new Decimal(2000),
        totalCredit: new Decimal(2000),
        items: {
          create: [
            {
              accountId: dummyAccount.id,
              analyticAccountId: analyticAccountId, // Tagged
              debit: new Decimal(2000),
              credit: new Decimal(0),
              date: new Date("2026-06-15T00:00:00Z"),
              status: EntryStatus.POSTED,
            },
            {
              accountId: dummyAccountCredit.id,
              debit: new Decimal(0),
              credit: new Decimal(2000),
              date: new Date("2026-06-15T00:00:00Z"),
              status: EntryStatus.POSTED,
            }
          ]
        }
      }
    });

    // Sync achievement
    await prisma.$transaction((tx) => syncBudgetAchievement(tx, budget.id));

    const updatedBudget = await prisma.budget.findUniqueOrThrow({ 
      where: { id: budget.id },
      include: { lines: true }
    });

    // The analytic account is EXPENSE. We posted a 2000 debit. Achieved should be 2000.
    expect(updatedBudget.lines[0].achievedAmount.toNumber()).toBe(2000);
  });
});
