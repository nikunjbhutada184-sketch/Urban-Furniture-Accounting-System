import { type TaxComputation } from "@prisma/client";
import {
  type Decimal,
  type MoneyInput,
  ZERO,
  add,
  lineAmount,
  percentOf,
  sum,
  toMoney,
} from "@/server/money";

/**
 * Document pricing.
 *
 * Pure functions: no database, no clock. Every order, bill and invoice total in
 * the system is computed here, so there is one definition of "what this line
 * costs" and it can be tested exhaustively.
 *
 * Money never becomes a JavaScript number: quantities and prices arrive as
 * strings from the form and stay Decimal all the way to Postgres.
 */

export interface TaxRule {
  computation: TaxComputation;
  /** Percentage (18 = 18%) or a flat amount, depending on `computation`. */
  rate: MoneyInput;
}

export interface LineAmounts {
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

/**
 * Amounts for one document line.
 *
 * `subtotal` is rounded once from quantity x unit price; tax is then computed
 * on the rounded subtotal, which is what an auditor reading the printed
 * document would do.
 */
export function computeLineAmounts(
  quantity: MoneyInput,
  unitPrice: MoneyInput,
  tax?: TaxRule | null,
): LineAmounts {
  const subtotal = lineAmount(quantity, unitPrice);
  const taxAmount = computeTax(subtotal, tax);

  return { subtotal, taxAmount, total: add(subtotal, taxAmount) };
}

export function computeTax(subtotal: MoneyInput, tax?: TaxRule | null): Decimal {
  if (!tax) return ZERO;

  return tax.computation === "FIXED" ? toMoney(tax.rate) : percentOf(subtotal, tax.rate);
}

export interface DocumentTotals {
  amountUntaxed: Decimal;
  amountTax: Decimal;
  amountTotal: Decimal;
}

/** Document totals are the sum of already-rounded line amounts. */
export function computeDocumentTotals(lines: readonly LineAmounts[]): DocumentTotals {
  const amountUntaxed = sum(lines.map((line) => line.subtotal));
  const amountTax = sum(lines.map((line) => line.taxAmount));

  return { amountUntaxed, amountTax, amountTotal: add(amountUntaxed, amountTax) };
}

/**
 * Tax grouped by the account it posts to.
 *
 * Several lines can share one tax account; the journal entry needs one line per
 * account, not one per document line.
 */
export function groupTaxByAccount(
  lines: readonly { taxAmount: Decimal; taxAccountId: string | null }[],
): Map<string, Decimal> {
  const byAccount = new Map<string, Decimal>();

  for (const line of lines) {
    if (!line.taxAccountId || line.taxAmount.isZero()) continue;

    const current = byAccount.get(line.taxAccountId) ?? ZERO;
    byAccount.set(line.taxAccountId, add(current, line.taxAmount));
  }

  return byAccount;
}

/**
 * Expense/income amounts grouped by the account they post to, for the same
 * reason: one journal line per account.
 */
export function groupSubtotalByAccount(
  lines: readonly { subtotal: Decimal; accountId: string }[],
): Map<string, Decimal> {
  const byAccount = new Map<string, Decimal>();

  for (const line of lines) {
    const current = byAccount.get(line.accountId) ?? ZERO;
    byAccount.set(line.accountId, add(current, line.subtotal));
  }

  return byAccount;
}
