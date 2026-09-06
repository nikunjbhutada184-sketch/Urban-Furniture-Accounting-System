import { AccountType, EntryStatus, InvoiceStatus } from "@prisma/client";
import { getAccountBalances, getTrialBalance } from "@/server/accounting/ledger-service";
import { type AccountBalance } from "@/server/accounting/types";
import { type DbClient, prisma } from "@/server/db/prisma";
import { type Decimal, ZERO, add, subtract, toAmountString, toMoney } from "@/server/money";

/**
 * Reporting engine.
 *
 * Every figure here is DERIVED, at query time, from posted journal items and
 * transactional data. Nothing is stored as an editable total, so a report can
 * never drift away from the books.
 *
 * All reports take a period. Balance-sheet style reports are cumulative (from
 * the beginning of time up to the end date); profit-and-loss style reports are
 * for the range itself.
 */

export interface ReportPeriod {
  from: Date;
  to: Date;
}

/** Sensible default: the current financial year to date. */
export function defaultPeriod(today: Date = new Date()): ReportPeriod {
  const year = today.getUTCFullYear();
  // Indian financial year starts 1 April.
  const startYear = today.getUTCMonth() >= 3 ? year : year - 1;

  return {
    from: new Date(Date.UTC(startYear, 3, 1)),
    to: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())),
  };
}

/** Parses `?from=&to=` into a period, falling back to the financial year. */
export function parsePeriod(
  searchParams: Record<string, string | string[] | undefined>,
): ReportPeriod {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

  const fallback = defaultPeriod();
  const rawFrom = first(searchParams.from);
  const rawTo = first(searchParams.to);

  const from =
    rawFrom && /^\d{4}-\d{2}-\d{2}$/.test(rawFrom)
      ? new Date(`${rawFrom}T00:00:00.000Z`)
      : fallback.from;
  const to =
    rawTo && /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? new Date(`${rawTo}T00:00:00.000Z`) : fallback.to;

  // A backwards range would silently return nothing; swap instead.
  return from.getTime() <= to.getTime() ? { from, to } : { from: to, to: from };
}

// ---------------------------------------------------------------------------
// 1. Trial balance
// ---------------------------------------------------------------------------

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
  isBalanced: boolean;
}

export async function getTrialBalanceReport(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<TrialBalanceReport> {
  const trialBalance = await getTrialBalance(client, { from: period.from, to: period.to });

  return {
    rows: trialBalance.rows.map((row) => ({
      accountId: row.accountId,
      code: row.code,
      name: row.name,
      type: row.type,
      debit: toAmountString(row.debit),
      credit: toAmountString(row.credit),
    })),
    totalDebit: toAmountString(trialBalance.totalDebit),
    totalCredit: toAmountString(trialBalance.totalCredit),
    difference: toAmountString(trialBalance.difference),
    isBalanced: trialBalance.isBalanced,
  };
}

// ---------------------------------------------------------------------------
// 2. Profit & Loss
// ---------------------------------------------------------------------------

export interface ReportLine {
  accountId: string;
  code: string;
  name: string;
  amount: string;
}

export interface ProfitAndLossReport {
  income: ReportLine[];
  expenses: ReportLine[];
  totalIncome: string;
  totalExpenses: string;
  netProfit: string;
  isProfit: boolean;
}

/**
 * Income less expenses for the period.
 *
 * Income is credit-natured and expense debit-natured, so each is presented as a
 * positive figure and the subtraction reads the way an accountant expects.
 */
export async function getProfitAndLoss(
  period: ReportPeriod,
  client: DbClient = prisma,
  options: { analyticAccountId?: string } = {},
): Promise<ProfitAndLossReport> {
  const balances = await getAccountBalances(client, {
    from: period.from,
    to: period.to,
    ...(options.analyticAccountId ? { analyticAccountId: options.analyticAccountId } : {}),
  });

  const income: ReportLine[] = [];
  const expenses: ReportLine[] = [];
  let totalIncome = ZERO;
  let totalExpenses = ZERO;

  for (const balance of balances) {
    if (balance.type === AccountType.INCOME) {
      // Credit-natured: flip so income reads positive.
      const amount = balance.balance.negated();
      totalIncome = add(totalIncome, amount);
      income.push(toLine(balance, amount));
    } else if (balance.type === AccountType.EXPENSE) {
      const amount = balance.balance;
      totalExpenses = add(totalExpenses, amount);
      expenses.push(toLine(balance, amount));
    }
  }

  const netProfit = subtract(totalIncome, totalExpenses);

  return {
    income,
    expenses,
    totalIncome: toAmountString(totalIncome),
    totalExpenses: toAmountString(totalExpenses),
    netProfit: toAmountString(netProfit),
    isProfit: !netProfit.isNegative(),
  };
}

function toLine(balance: AccountBalance, amount: Decimal): ReportLine {
  return {
    accountId: balance.accountId,
    code: balance.code,
    name: balance.name,
    amount: toAmountString(amount),
  };
}

// ---------------------------------------------------------------------------
// 3. Balance sheet
// ---------------------------------------------------------------------------

export interface BalanceSheetReport {
  assets: ReportLine[];
  liabilities: ReportLine[];
  capital: ReportLine[];
  totalAssets: string;
  totalLiabilities: string;
  totalCapital: string;
  /**
   * All income less all expenses up to the as-at date, which is what actually
   * makes the equation hold. Distinct from `netProfit`, which covers only the
   * selected period.
   */
  retainedEarnings: string;
  /** Profit for the period, folded into capital so the sheet balances. */
  netProfit: string;
  totalLiabilitiesAndCapital: string;
  difference: string;
  isBalanced: boolean;
}

/**
 * A snapshot as at `period.to`.
 *
 * Balance-sheet accounts are cumulative, so the range start is ignored for the
 * balances themselves; the period is used for the profit figure that is rolled
 * into capital, which is what makes Assets = Liabilities + Capital hold.
 */
export async function getBalanceSheet(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<BalanceSheetReport> {
  const [balances, profitAndLoss] = await Promise.all([
    getAccountBalances(client, { to: period.to }),
    getProfitAndLoss({ from: period.from, to: period.to }, client),
  ]);

  const assets: ReportLine[] = [];
  const liabilities: ReportLine[] = [];
  const capital: ReportLine[] = [];

  let totalAssets = ZERO;
  let totalLiabilities = ZERO;
  let totalCapital = ZERO;

  /**
   * Cumulative income less expenses, to the as-at date.
   *
   * Income and expense accounts are never closed into capital in this system,
   * so everything they hold is retained earnings and belongs on this sheet.
   *
   * Folding in only the *period's* profit — as this did — leaves out every
   * pound traded before `period.from`, and the balance sheet then fails to
   * balance by exactly that amount. It went unnoticed while all activity
   * happened to start on the first day of the reporting period.
   *
   * Income is credit-natured and expense debit-natured, so negating the sum of
   * both signed balances gives profit directly.
   */
  let retainedEarnings = ZERO;

  for (const balance of balances) {
    switch (balance.type) {
      case AccountType.ASSET: {
        totalAssets = add(totalAssets, balance.balance);
        assets.push(toLine(balance, balance.balance));
        break;
      }
      case AccountType.LIABILITY: {
        const amount = balance.balance.negated();
        totalLiabilities = add(totalLiabilities, amount);
        liabilities.push(toLine(balance, amount));
        break;
      }
      case AccountType.CAPITAL: {
        const amount = balance.balance.negated();
        totalCapital = add(totalCapital, amount);
        capital.push(toLine(balance, amount));
        break;
      }
      case AccountType.INCOME:
      case AccountType.EXPENSE: {
        retainedEarnings = subtract(retainedEarnings, balance.balance);
        break;
      }
      default:
        break;
    }
  }

  // The period's profit is reported for context; retained earnings is what is
  // folded into capital, because that is what the assets were actually built
  // from.
  const netProfit = toMoney(profitAndLoss.netProfit);
  const totalCapitalWithProfit = add(totalCapital, retainedEarnings);
  const totalLiabilitiesAndCapital = add(totalLiabilities, totalCapitalWithProfit);
  const difference = subtract(totalAssets, totalLiabilitiesAndCapital);

  return {
    assets,
    liabilities,
    capital,
    totalAssets: toAmountString(totalAssets),
    totalLiabilities: toAmountString(totalLiabilities),
    totalCapital: toAmountString(totalCapitalWithProfit),
    retainedEarnings: toAmountString(retainedEarnings),
    netProfit: toAmountString(netProfit),
    totalLiabilitiesAndCapital: toAmountString(totalLiabilitiesAndCapital),
    difference: toAmountString(difference),
    isBalanced: difference.isZero(),
  };
}

// ---------------------------------------------------------------------------
// 4. Customer / vendor outstanding
// ---------------------------------------------------------------------------

export interface OutstandingRow {
  contactId: string;
  contactName: string;
  documentId: string;
  documentNumber: string;
  documentDate: Date;
  dueDate: Date | null;
  total: string;
  paid: string;
  outstanding: string;
  isOverdue: boolean;
}

export interface OutstandingReport {
  rows: OutstandingRow[];
  totalOutstanding: string;
  totalOverdue: string;
}

const OPEN_STATUSES = [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID];

export async function getCustomerOutstandingReport(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<OutstandingReport> {
  const invoices = await client.customerInvoice.findMany({
    where: { status: { in: OPEN_STATUSES }, invoiceDate: { lte: period.to } },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
    select: {
      id: true,
      number: true,
      invoiceDate: true,
      dueDate: true,
      amountTotal: true,
      amountPaid: true,
      amountResidual: true,
      customer: { select: { id: true, name: true } },
    },
  });

  return summariseOutstanding(
    invoices.map((invoice) => ({
      contactId: invoice.customer.id,
      contactName: invoice.customer.name,
      documentId: invoice.id,
      documentNumber: invoice.number,
      documentDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: invoice.amountTotal,
      paid: invoice.amountPaid,
      outstanding: invoice.amountResidual,
    })),
    period.to,
  );
}

export async function getVendorOutstandingReport(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<OutstandingReport> {
  const bills = await client.vendorBill.findMany({
    where: { status: { in: OPEN_STATUSES }, invoiceDate: { lte: period.to } },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
    select: {
      id: true,
      number: true,
      invoiceDate: true,
      dueDate: true,
      amountTotal: true,
      amountPaid: true,
      amountResidual: true,
      vendor: { select: { id: true, name: true } },
    },
  });

  return summariseOutstanding(
    bills.map((bill) => ({
      contactId: bill.vendor.id,
      contactName: bill.vendor.name,
      documentId: bill.id,
      documentNumber: bill.number,
      documentDate: bill.invoiceDate,
      dueDate: bill.dueDate,
      total: bill.amountTotal,
      paid: bill.amountPaid,
      outstanding: bill.amountResidual,
    })),
    period.to,
  );
}

function summariseOutstanding(
  documents: {
    contactId: string;
    contactName: string;
    documentId: string;
    documentNumber: string;
    documentDate: Date;
    dueDate: Date | null;
    total: Decimal;
    paid: Decimal;
    outstanding: Decimal;
  }[],
  asAt: Date,
): OutstandingReport {
  let totalOutstanding = ZERO;
  let totalOverdue = ZERO;

  const rows = documents.map((document) => {
    const isOverdue = document.dueDate !== null && document.dueDate.getTime() < asAt.getTime();

    totalOutstanding = add(totalOutstanding, document.outstanding);
    if (isOverdue) totalOverdue = add(totalOverdue, document.outstanding);

    return {
      contactId: document.contactId,
      contactName: document.contactName,
      documentId: document.documentId,
      documentNumber: document.documentNumber,
      documentDate: document.documentDate,
      dueDate: document.dueDate,
      total: toAmountString(document.total),
      paid: toAmountString(document.paid),
      outstanding: toAmountString(document.outstanding),
      isOverdue,
    };
  });

  return {
    rows,
    totalOutstanding: toAmountString(totalOutstanding),
    totalOverdue: toAmountString(totalOverdue),
  };
}

// ---------------------------------------------------------------------------
// 5. Stock report
// ---------------------------------------------------------------------------

export interface StockReportRow {
  productId: string;
  name: string;
  sku: string | null;
  opening: string;
  purchases: string;
  sales: string;
  adjustments: string;
  closing: string;
  value: string;
}

/**
 * Opening, movement and closing quantity per tracked product for the period.
 *
 * Opening is everything before the range; the movement columns are split by
 * what caused them, so a discrepancy can be traced to purchases, sales or a
 * manual correction.
 */
export async function getStockReport(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<StockReportRow[]> {
  const products = await client.product.findMany({
    where: { trackInventory: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true },
  });

  if (products.length === 0) return [];

  const productIds = products.map((product) => product.id);

  const [openingMoves, periodMoves] = await Promise.all([
    client.stockMove.groupBy({
      by: ["productId", "direction"],
      where: { productId: { in: productIds }, date: { lt: period.from } },
      _sum: { quantity: true },
    }),
    client.stockMove.groupBy({
      by: ["productId", "direction", "moveType"],
      where: {
        productId: { in: productIds },
        date: { gte: period.from, lte: period.to },
      },
      _sum: { quantity: true, value: true },
    }),
  ]);

  const opening = new Map<string, Decimal>();
  for (const row of openingMoves) {
    const current = opening.get(row.productId) ?? ZERO;
    const quantity = toMoney(row._sum.quantity ?? 0);
    opening.set(
      row.productId,
      row.direction === "IN" ? add(current, quantity) : subtract(current, quantity),
    );
  }

  const purchases = new Map<string, Decimal>();
  const sales = new Map<string, Decimal>();
  const adjustments = new Map<string, Decimal>();
  const values = new Map<string, Decimal>();

  for (const row of periodMoves) {
    const quantity = toMoney(row._sum.quantity ?? 0);
    const value = toMoney(row._sum.value ?? 0);

    const signedValue = row.direction === "IN" ? value : value.negated();
    values.set(row.productId, add(values.get(row.productId) ?? ZERO, signedValue));

    if (row.moveType === "PURCHASE_RECEIPT" || row.moveType === "RETURN_IN") {
      purchases.set(row.productId, add(purchases.get(row.productId) ?? ZERO, quantity));
    } else if (row.moveType === "SALE_DELIVERY" || row.moveType === "RETURN_OUT") {
      sales.set(row.productId, add(sales.get(row.productId) ?? ZERO, quantity));
    } else {
      // Adjustments and opening balances are signed by direction.
      const signed = row.direction === "IN" ? quantity : quantity.negated();
      adjustments.set(row.productId, add(adjustments.get(row.productId) ?? ZERO, signed));
    }
  }

  return products.map((product) => {
    const open = opening.get(product.id) ?? ZERO;
    const bought = purchases.get(product.id) ?? ZERO;
    const sold = sales.get(product.id) ?? ZERO;
    const adjusted = adjustments.get(product.id) ?? ZERO;
    const closing = add(subtract(add(open, bought), sold), adjusted);

    return {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      opening: toAmountString(open),
      purchases: toAmountString(bought),
      sales: toAmountString(sold),
      adjustments: toAmountString(adjusted),
      closing: toAmountString(closing),
      value: toAmountString(values.get(product.id) ?? ZERO),
    };
  });
}

// ---------------------------------------------------------------------------
// 6. Budget report
// ---------------------------------------------------------------------------

export interface BudgetReportRow {
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  lineId: string;
  analyticCode: string;
  analyticName: string;
  type: string;
  planned: string;
  committed: string;
  achieved: string;
  achievedPercent: number | null;
  toAchieve: string;
}

/**
 * Every budget line overlapping the period, with its derived progress.
 *
 * Achieved comes from the posted ledger via `recomputeBudgetProgress`, so the
 * report and the books agree by construction.
 */
export async function getBudgetReport(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<BudgetReportRow[]> {
  const budgets = await client.budget.findMany({
    where: {
      // Any budget whose period overlaps the requested range.
      periodStart: { lte: period.to },
      periodEnd: { gte: period.from },
      status: { notIn: ["CANCELLED"] },
    },
    orderBy: [{ periodStart: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      status: true,
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          plannedAmount: true,
          committedAmount: true,
          achievedAmount: true,
          analyticAccount: { select: { code: true, name: true } },
        },
      },
    },
  });

  return budgets.flatMap((budget) =>
    budget.lines.map((line) => {
      const planned = toMoney(line.plannedAmount);
      const achieved = toMoney(line.achievedAmount);
      const remaining = subtract(planned, achieved);

      return {
        budgetId: budget.id,
        budgetName: budget.name,
        budgetStatus: budget.status,
        lineId: line.id,
        analyticCode: line.analyticAccount.code,
        analyticName: line.analyticAccount.name,
        type: line.type,
        planned: toAmountString(planned),
        committed: toAmountString(line.committedAmount),
        achieved: toAmountString(achieved),
        achievedPercent: planned.isZero()
          ? null
          : Number(achieved.dividedBy(planned).times(100).toFixed(1)),
        toAchieve: toAmountString(remaining.isNegative() ? ZERO : remaining),
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// 7. General ledger
// ---------------------------------------------------------------------------

export interface GeneralLedgerRow {
  itemId: string;
  date: Date;
  entryId: string;
  entryNumber: string;
  journalCode: string;
  reference: string | null;
  description: string | null;
  contactName: string | null;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface GeneralLedgerReport {
  account: { id: string; code: string; name: string; type: AccountType };
  openingBalance: string;
  closingBalance: string;
  totalDebit: string;
  totalCredit: string;
  rows: GeneralLedgerRow[];
}

/**
 * Every posted movement on one account for the period, with a running balance
 * carried forward from the opening position.
 */
export async function getGeneralLedger(
  accountId: string,
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<GeneralLedgerReport | null> {
  const account = await client.ledgerAccount.findUnique({
    where: { id: accountId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!account) return null;

  const [openingAggregate, items] = await Promise.all([
    client.journalItem.aggregate({
      where: { accountId, status: EntryStatus.POSTED, date: { lt: period.from } },
      _sum: { debit: true, credit: true },
    }),
    client.journalItem.findMany({
      where: {
        accountId,
        status: EntryStatus.POSTED,
        date: { gte: period.from, lte: period.to },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { sequence: "asc" }],
      select: {
        id: true,
        date: true,
        debit: true,
        credit: true,
        description: true,
        contact: { select: { name: true } },
        journalEntry: {
          select: {
            id: true,
            number: true,
            reference: true,
            journal: { select: { code: true } },
          },
        },
      },
    }),
  ]);

  const openingBalance = subtract(
    toMoney(openingAggregate._sum.debit ?? 0),
    toMoney(openingAggregate._sum.credit ?? 0),
  );

  let running = openingBalance;
  let totalDebit = ZERO;
  let totalCredit = ZERO;

  const rows = items.map((item) => {
    const debit = toMoney(item.debit);
    const credit = toMoney(item.credit);

    running = subtract(add(running, debit), credit);
    totalDebit = add(totalDebit, debit);
    totalCredit = add(totalCredit, credit);

    return {
      itemId: item.id,
      date: item.date,
      entryId: item.journalEntry.id,
      entryNumber: item.journalEntry.number,
      journalCode: item.journalEntry.journal.code,
      reference: item.journalEntry.reference,
      description: item.description,
      contactName: item.contact?.name ?? null,
      debit: toAmountString(debit),
      credit: toAmountString(credit),
      runningBalance: toAmountString(running),
    };
  });

  return {
    account,
    openingBalance: toAmountString(openingBalance),
    closingBalance: toAmountString(running),
    totalDebit: toAmountString(totalDebit),
    totalCredit: toAmountString(totalCredit),
    rows,
  };
}
