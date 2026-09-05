import { type JournalEntryDraft } from "@/server/accounting";
import { ValidationError } from "@/server/errors";
import { type Decimal, isZero, sum, toAmountString } from "@/server/money";
import { groupSubtotalByAccount, groupTaxByAccount } from "./pricing";

/**
 * Vendor bill -> journal entry.
 *
 * A pure function, deliberately: given a bill's lines and the accounts they
 * resolve to, it produces the journal entry draft and nothing else. No
 * database, no side effects, fully unit-testable.
 *
 * The purchase module does NOT post it -- it hands the draft to
 * `AccountingService.postJournalEntry`, which enforces the balance rule. The
 * accounting logic lives in exactly one place.
 *
 *   Dr  Purchases Expense (per line's expense account)   untaxed
 *   Dr  Input Tax Credit  (per tax's paid account)       tax
 *       Cr  Creditors     (vendor's payable account)     total
 */

export interface BillPostingLine {
  /** Expense or asset account debited for this line. */
  accountId: string;
  subtotal: Decimal;
  taxAmount: Decimal;
  /** Account the input tax is debited to; null when the line has no tax. */
  taxAccountId: string | null;
  analyticAccountId?: string | null;
  description?: string | null;
}

export interface BillPostingInput {
  journalId: string;
  invoiceDate: Date;
  billNumber: string;
  vendorId: string;
  vendorReference?: string | null;
  /** The vendor's payable control account. */
  payableAccountId: string;
  lines: readonly BillPostingLine[];
  billId: string;
}

export function buildVendorBillEntry(input: BillPostingInput): JournalEntryDraft {
  if (input.lines.length === 0) {
    throw new ValidationError("A vendor bill must have at least one line before it can be posted.");
  }

  const expenseByAccount = groupSubtotalByAccount(input.lines);
  const taxByAccount = groupTaxByAccount(input.lines);

  const total = sum([...[...expenseByAccount.values()], ...[...taxByAccount.values()]]);

  if (isZero(total)) {
    throw new ValidationError("A vendor bill must have a non-zero total before it can be posted.");
  }

  const analyticByAccount = new Map<string, string | null>();
  for (const line of input.lines) {
    if (!analyticByAccount.has(line.accountId)) {
      analyticByAccount.set(line.accountId, line.analyticAccountId ?? null);
    } else if (analyticByAccount.get(line.accountId) !== (line.analyticAccountId ?? null)) {
      // Mixed analytic tags on one account: drop the tag rather than pick one.
      analyticByAccount.set(line.accountId, null);
    }
  }

  const lines: JournalEntryDraft["lines"] = [];

  // Dr expense accounts.
  for (const [accountId, amount] of expenseByAccount) {
    if (isZero(amount)) continue;
    lines.push({
      accountId,
      debit: amount,
      contactId: input.vendorId,
      analyticAccountId: analyticByAccount.get(accountId) ?? null,
      description: `Bill ${input.billNumber}`,
    });
  }

  // Dr input tax.
  for (const [accountId, amount] of taxByAccount) {
    lines.push({
      accountId,
      debit: amount,
      contactId: input.vendorId,
      description: `Input tax on ${input.billNumber}`,
    });
  }

  // Cr the vendor's payable control account for the gross total.
  lines.push({
    accountId: input.payableAccountId,
    credit: total,
    contactId: input.vendorId,
    description: `Bill ${input.billNumber}`,
  });

  return {
    journalId: input.journalId,
    date: input.invoiceDate,
    reference: input.vendorReference ?? input.billNumber,
    description: `Vendor bill ${input.billNumber}`,
    sourceType: "VendorBill",
    sourceId: input.billId,
    lines,
  };
}

/** Human-readable preview of an entry draft, used in tests and the UI. */
export function describeEntry(draft: JournalEntryDraft): string[] {
  return draft.lines.map((line) => {
    const side = line.debit && !isZero(line.debit) ? "Dr" : "Cr";
    const amount = side === "Dr" ? line.debit : line.credit;
    return `${side} ${line.accountId} ${toAmountString(amount ?? 0)}`;
  });
}
