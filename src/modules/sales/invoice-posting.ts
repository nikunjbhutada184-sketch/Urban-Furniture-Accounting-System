import { groupSubtotalByAccount, groupTaxByAccount } from "@/modules/purchases/pricing";
import { type JournalEntryDraft } from "@/server/accounting";
import { ValidationError } from "@/server/errors";
import { type Decimal, isZero, sum } from "@/server/money";

/**
 * Customer invoice -> journal entry.
 *
 * Pure, like its purchase counterpart: it produces the draft, and the
 * accounting engine posts it. The sales module contains no debit/credit
 * arithmetic of its own, and React components never see any of this.
 *
 *   Dr  Debtors (customer's receivable account)     total
 *       Cr  Sales Income (per line's income account)  untaxed
 *       Cr  Tax Payable  (per tax's collected account) tax
 *
 * The mirror image of a vendor bill, which is exactly what double-entry
 * expects: what is a receivable to us is a payable to them.
 */

export interface InvoicePostingLine {
  /** Income account credited for this line. */
  accountId: string;
  subtotal: Decimal;
  taxAmount: Decimal;
  /** Account the collected tax is credited to; null when the line has no tax. */
  taxAccountId: string | null;
  analyticAccountId?: string | null;
  description?: string | null;
}

export interface InvoicePostingInput {
  journalId: string;
  invoiceDate: Date;
  invoiceNumber: string;
  invoiceId: string;
  customerId: string;
  reference?: string | null;
  /** The customer's receivable control account. */
  receivableAccountId: string;
  lines: readonly InvoicePostingLine[];
}

export function buildCustomerInvoiceEntry(input: InvoicePostingInput): JournalEntryDraft {
  if (input.lines.length === 0) {
    throw new ValidationError(
      "A customer invoice must have at least one line before it can be posted.",
    );
  }

  const incomeByAccount = groupSubtotalByAccount(input.lines);
  const taxByAccount = groupTaxByAccount(input.lines);

  const total = sum([...incomeByAccount.values(), ...taxByAccount.values()]);

  if (isZero(total)) {
    throw new ValidationError(
      "A customer invoice must have a non-zero total before it can be posted.",
    );
  }

  // Keep an analytic tag only when every line on that account agrees.
  const analyticByAccount = new Map<string, string | null>();
  for (const line of input.lines) {
    if (!analyticByAccount.has(line.accountId)) {
      analyticByAccount.set(line.accountId, line.analyticAccountId ?? null);
    } else if (analyticByAccount.get(line.accountId) !== (line.analyticAccountId ?? null)) {
      analyticByAccount.set(line.accountId, null);
    }
  }

  const lines: JournalEntryDraft["lines"] = [];

  // Dr the customer's receivable for the gross total.
  lines.push({
    accountId: input.receivableAccountId,
    debit: total,
    contactId: input.customerId,
    description: `Invoice ${input.invoiceNumber}`,
  });

  // Cr income accounts.
  for (const [accountId, amount] of incomeByAccount) {
    if (isZero(amount)) continue;
    lines.push({
      accountId,
      credit: amount,
      contactId: input.customerId,
      analyticAccountId: analyticByAccount.get(accountId) ?? null,
      description: `Invoice ${input.invoiceNumber}`,
    });
  }

  // Cr tax payable.
  for (const [accountId, amount] of taxByAccount) {
    lines.push({
      accountId,
      credit: amount,
      contactId: input.customerId,
      description: `Tax on ${input.invoiceNumber}`,
    });
  }

  return {
    journalId: input.journalId,
    date: input.invoiceDate,
    reference: input.reference ?? input.invoiceNumber,
    description: `Customer invoice ${input.invoiceNumber}`,
    sourceType: "CustomerInvoice",
    sourceId: input.invoiceId,
    lines,
  };
}
