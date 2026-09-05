import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  getBalanceSheet,
  getCustomerOutstandingReport,
  getGeneralLedger,
  getProfitAndLoss,
  getStockReport,
  getTrialBalanceReport,
  getVendorOutstandingReport,
  parsePeriod,
} from "@/modules/reporting/report-service";

/**
 * Reporting engine against a real database.
 *
 * Every report is derived from posted journal items, so the accounting
 * identities must hold no matter what has been posted:
 *
 *   Trial balance:  sum(debit) = sum(credit)
 *   Balance sheet:  Assets = Liabilities + Capital
 *   P&L:            Net profit = Income - Expenses
 *
 * These are the assertions that would catch a reporting bug before a user does.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("reporting engine (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  // Wide enough to cover everything the other integration suites post.
  const period = {
    from: new Date("2020-01-01T00:00:00Z"),
    to: new Date("2030-12-31T00:00:00Z"),
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("trial balance: total debits equal total credits", async () => {
    const report = await getTrialBalanceReport(period, prisma);

    expect(report.isBalanced).toBe(true);
    expect(report.difference).toBe("0.00");
    expect(report.totalDebit).toBe(report.totalCredit);
  });

  it("profit & loss: net profit equals income less expenses", async () => {
    const report = await getProfitAndLoss(period, prisma);

    const expected = (Number(report.totalIncome) - Number(report.totalExpenses)).toFixed(2);
    expect(report.netProfit).toBe(expected);
    expect(report.isProfit).toBe(Number(report.netProfit) >= 0);
  });

  it("profit & loss: every line is positive, whichever side it is on", async () => {
    const report = await getProfitAndLoss(period, prisma);

    // Income is credit-natured and expense debit-natured; both are presented
    // as positive so the subtraction reads naturally.
    for (const line of [...report.income, ...report.expenses]) {
      expect(Number(line.amount)).toBeGreaterThanOrEqual(0);
    }
  });

  it("balance sheet: Assets = Liabilities + Capital", async () => {
    const report = await getBalanceSheet(period, prisma);

    expect(report.isBalanced).toBe(true);
    expect(report.difference).toBe("0.00");
    expect(report.totalAssets).toBe(report.totalLiabilitiesAndCapital);
  });

  it("balance sheet: capital includes the period's profit", async () => {
    const [balanceSheet, profitAndLoss] = await Promise.all([
      getBalanceSheet(period, prisma),
      getProfitAndLoss(period, prisma),
    ]);

    expect(balanceSheet.netProfit).toBe(profitAndLoss.netProfit);
  });

  it("balance sheet: the sections sum to their totals", async () => {
    const report = await getBalanceSheet(period, prisma);

    const sum = (lines: { amount: string }[]) =>
      lines.reduce((total, line) => total + Number(line.amount), 0).toFixed(2);

    expect(sum(report.assets)).toBe(report.totalAssets);
    expect(sum(report.liabilities)).toBe(report.totalLiabilities);
    // Capital additionally carries the period profit.
    expect((Number(sum(report.capital)) + Number(report.netProfit)).toFixed(2)).toBe(
      report.totalCapital,
    );
  });

  it("general ledger: the running balance ends at the closing balance", async () => {
    const account = await prisma.ledgerAccount.findUniqueOrThrow({ where: { code: "1100" } });
    const report = await getGeneralLedger(account.id, period, prisma);

    expect(report).not.toBeNull();
    if (!report) return;

    if (report.rows.length > 0) {
      expect(report.rows.at(-1)?.runningBalance).toBe(report.closingBalance);
    }

    // Closing = opening + debits - credits.
    const expected = (
      Number(report.openingBalance) +
      Number(report.totalDebit) -
      Number(report.totalCredit)
    ).toFixed(2);
    expect(report.closingBalance).toBe(expected);
  });

  it("general ledger: an unknown account returns null rather than throwing", async () => {
    expect(await getGeneralLedger("does_not_exist", period, prisma)).toBeNull();
  });

  it("customer outstanding: rows sum to the reported total", async () => {
    const report = await getCustomerOutstandingReport(period, prisma);

    const sum = report.rows
      .reduce((total, row) => total + Number(row.outstanding), 0)
      .toFixed(2);
    expect(sum).toBe(report.totalOutstanding);

    // Outstanding is always total less paid.
    for (const row of report.rows) {
      expect(Number(row.outstanding).toFixed(2)).toBe(
        (Number(row.total) - Number(row.paid)).toFixed(2),
      );
    }
  });

  it("vendor outstanding: rows sum to the reported total", async () => {
    const report = await getVendorOutstandingReport(period, prisma);

    const sum = report.rows
      .reduce((total, row) => total + Number(row.outstanding), 0)
      .toFixed(2);
    expect(sum).toBe(report.totalOutstanding);
  });

  it("stock report: closing = opening + purchases - sales + adjustments", async () => {
    const rows = await getStockReport(period, prisma);

    for (const row of rows) {
      const expected = (
        Number(row.opening) +
        Number(row.purchases) -
        Number(row.sales) +
        Number(row.adjustments)
      ).toFixed(2);

      expect(row.closing).toBe(expected);
    }
  });

  it("period parsing accepts a range, and repairs a backwards one", async () => {
    const forward = parsePeriod({ from: "2026-04-01", to: "2026-06-30" });
    expect(forward.from.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(forward.to.toISOString().slice(0, 10)).toBe("2026-06-30");

    // A backwards range would silently return nothing, so it is swapped.
    const backwards = parsePeriod({ from: "2026-06-30", to: "2026-04-01" });
    expect(backwards.from.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(backwards.to.toISOString().slice(0, 10)).toBe("2026-06-30");

    // Garbage falls back to the financial year rather than crashing.
    const fallback = parsePeriod({ from: "nonsense", to: undefined });
    expect(fallback.from).toBeInstanceOf(Date);
    expect(fallback.to).toBeInstanceOf(Date);
  });

  it("reports narrow correctly when the period excludes everything", async () => {
    const empty = {
      from: new Date("1990-01-01T00:00:00Z"),
      to: new Date("1990-12-31T00:00:00Z"),
    };

    const [trialBalance, profitAndLoss] = await Promise.all([
      getTrialBalanceReport(empty, prisma),
      getProfitAndLoss(empty, prisma),
    ]);

    expect(trialBalance.rows).toHaveLength(0);
    expect(trialBalance.isBalanced).toBe(true);
    expect(profitAndLoss.netProfit).toBe("0.00");
  });
});
