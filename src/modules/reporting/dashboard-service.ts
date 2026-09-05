import { AccountKind, EntryStatus, InvoiceStatus } from "@prisma/client";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ZERO, add, subtract, toAmountString, toMoney } from "@/server/money";
import {
  type ReportPeriod,
  getBalanceSheet,
  getProfitAndLoss,
} from "./report-service";

/**
 * Dashboard figures.
 *
 * Every number here is read from the ledger and the document tables at request
 * time. There are no hardcoded or illustrative values anywhere in this file --
 * an empty database produces an empty dashboard, which is the honest answer.
 */

export interface DashboardOverview {
  totalIncome: string;
  totalExpenses: string;
  netProfit: string;
  isProfit: boolean;
  receivables: string;
  payables: string;
  cash: string;
  bank: string;
  cashAndBank: string;
}

/** Sum of the current balance on every account of a given kind. */
async function balanceForKinds(
  client: DbClient,
  kinds: AccountKind[],
  to: Date,
): Promise<string> {
  const accounts = await client.ledgerAccount.findMany({
    where: { kind: { in: kinds } },
    select: { id: true },
  });

  if (accounts.length === 0) return "0.00";

  const aggregate = await client.journalItem.aggregate({
    where: {
      accountId: { in: accounts.map((account) => account.id) },
      status: EntryStatus.POSTED,
      date: { lte: to },
    },
    _sum: { debit: true, credit: true },
  });

  return toAmountString(
    subtract(toMoney(aggregate._sum.debit ?? 0), toMoney(aggregate._sum.credit ?? 0)),
  );
}

export async function getDashboardOverview(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<DashboardOverview> {
  const [profitAndLoss, cash, bank, receivables, payables] = await Promise.all([
    getProfitAndLoss(period, client),
    balanceForKinds(client, [AccountKind.CASH], period.to),
    balanceForKinds(client, [AccountKind.BANK], period.to),
    balanceForKinds(client, [AccountKind.RECEIVABLE], period.to),
    balanceForKinds(client, [AccountKind.PAYABLE], period.to),
  ]);

  return {
    totalIncome: profitAndLoss.totalIncome,
    totalExpenses: profitAndLoss.totalExpenses,
    netProfit: profitAndLoss.netProfit,
    isProfit: profitAndLoss.isProfit,
    // Payables are credit-natured; show what is owed as a positive figure.
    receivables: profitAndLoss ? receivables : receivables,
    payables: toAmountString(toMoney(payables).negated()),
    cash,
    bank,
    cashAndBank: toAmountString(add(toMoney(cash), toMoney(bank))),
  };
}

export interface MonthlyPoint {
  month: string;
  label: string;
  income: number;
  expenses: number;
}

/**
 * Income and expenses per month across the period.
 *
 * Returned as numbers because they are only used to size chart bars -- the
 * figures a user reads come from `getDashboardOverview` as exact decimals.
 */
export async function getMonthlySeries(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<MonthlyPoint[]> {
  const items = await client.journalItem.findMany({
    where: {
      status: EntryStatus.POSTED,
      date: { gte: period.from, lte: period.to },
      account: { type: { in: ["INCOME", "EXPENSE"] } },
    },
    select: {
      date: true,
      debit: true,
      credit: true,
      account: { select: { type: true } },
    },
  });

  const buckets = new Map<string, { income: number; expenses: number }>();

  for (const item of items) {
    const key = item.date.toISOString().slice(0, 7);
    const bucket = buckets.get(key) ?? { income: 0, expenses: 0 };

    const debit = Number(item.debit);
    const credit = Number(item.credit);

    if (item.account.type === "INCOME") bucket.income += credit - debit;
    else bucket.expenses += debit - credit;

    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => {
      const [year, monthNumber] = month.split("-");
      const date = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));

      return {
        month,
        label: date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
        income: Math.max(value.income, 0),
        expenses: Math.max(value.expenses, 0),
      };
    });
}

export interface ActivityRow {
  id: string;
  number: string;
  date: Date;
  description: string;
  journalCode: string;
  amount: string;
}

/** The most recently posted journal entries. */
export async function getRecentActivity(
  client: DbClient = prisma,
  take = 6,
): Promise<ActivityRow[]> {
  const entries = await client.journalEntry.findMany({
    where: { status: EntryStatus.POSTED },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      number: true,
      date: true,
      description: true,
      reference: true,
      totalDebit: true,
      journal: { select: { code: true } },
    },
  });

  return entries.map((entry) => ({
    id: entry.id,
    number: entry.number,
    date: entry.date,
    description: entry.description ?? entry.reference ?? "Journal entry",
    journalCode: entry.journal.code,
    amount: toAmountString(entry.totalDebit),
  }));
}

export interface OpenDocumentRow {
  id: string;
  number: string;
  contactName: string;
  dueDate: Date | null;
  outstanding: string;
  isOverdue: boolean;
}

/** Open customer invoices, most urgent first. */
export async function getOpenInvoices(
  client: DbClient = prisma,
  take = 5,
): Promise<OpenDocumentRow[]> {
  const invoices = await client.customerInvoice.findMany({
    where: { status: { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID] } },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
    take,
    select: {
      id: true,
      number: true,
      dueDate: true,
      amountResidual: true,
      customer: { select: { name: true } },
    },
  });

  const now = Date.now();

  return invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    contactName: invoice.customer.name,
    dueDate: invoice.dueDate,
    outstanding: toAmountString(invoice.amountResidual),
    isOverdue: invoice.dueDate !== null && invoice.dueDate.getTime() < now,
  }));
}

/** Open vendor bills, most urgent first. */
export async function getOpenBills(
  client: DbClient = prisma,
  take = 5,
): Promise<OpenDocumentRow[]> {
  const bills = await client.vendorBill.findMany({
    where: { status: { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID] } },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
    take,
    select: {
      id: true,
      number: true,
      dueDate: true,
      amountResidual: true,
      vendor: { select: { name: true } },
    },
  });

  const now = Date.now();

  return bills.map((bill) => ({
    id: bill.id,
    number: bill.number,
    contactName: bill.vendor.name,
    dueDate: bill.dueDate,
    outstanding: toAmountString(bill.amountResidual),
    isOverdue: bill.dueDate !== null && bill.dueDate.getTime() < now,
  }));
}

export interface ActiveBudgetRow {
  id: string;
  name: string;
  planned: string;
  committed: string;
  achieved: string;
  achievedPercent: number | null;
  toAchieve: string;
}

/** Confirmed budgets whose period overlaps the report period. */
export async function getActiveBudgets(
  period: ReportPeriod,
  client: DbClient = prisma,
  take = 4,
): Promise<ActiveBudgetRow[]> {
  const budgets = await client.budget.findMany({
    where: {
      status: "CONFIRMED",
      periodStart: { lte: period.to },
      periodEnd: { gte: period.from },
    },
    orderBy: { periodStart: "desc" },
    take,
    select: {
      id: true,
      name: true,
      lines: { select: { plannedAmount: true, committedAmount: true, achievedAmount: true } },
    },
  });

  return budgets.map((budget) => {
    let planned = ZERO;
    let committed = ZERO;
    let achieved = ZERO;

    for (const line of budget.lines) {
      planned = add(planned, line.plannedAmount);
      committed = add(committed, line.committedAmount);
      achieved = add(achieved, line.achievedAmount);
    }

    const remaining = subtract(planned, achieved);

    return {
      id: budget.id,
      name: budget.name,
      planned: toAmountString(planned),
      committed: toAmountString(committed),
      achieved: toAmountString(achieved),
      achievedPercent: planned.isZero()
        ? null
        : Number(achieved.dividedBy(planned).times(100).toFixed(1)),
      toAchieve: toAmountString(remaining.isNegative() ? ZERO : remaining),
    };
  });
}

/** Balance-sheet health, so the dashboard can surface a broken ledger. */
export async function getLedgerHealth(period: ReportPeriod, client: DbClient = prisma) {
  const balanceSheet = await getBalanceSheet(period, client);
  return { isBalanced: balanceSheet.isBalanced, difference: balanceSheet.difference };
}
