import { type PaymentDirection } from "@prisma/client";
import { type JournalEntryDraft } from "@/server/accounting";
import { ValidationError } from "@/server/errors";
import { type Decimal, isPositive } from "@/server/money";

/**
 * Payment -> journal entry.
 *
 * Pure, like the bill builder: it produces a draft, and the accounting engine
 * posts it. The payments module never writes to the ledger itself.
 *
 *   Outbound (paying a vendor)      Dr Creditors  /  Cr Bank or Cash
 *   Inbound  (receiving from a customer)  Dr Bank or Cash  /  Cr Debtors
 */

export interface PaymentPostingInput {
  journalId: string;
  paymentNumber: string;
  paymentId: string;
  paymentDate: Date;
  direction: PaymentDirection;
  amount: Decimal;
  contactId: string;
  /** The cash or bank account money actually moves through. */
  paymentAccountId: string;
  /** Receivable (inbound) or payable (outbound) control account. */
  counterpartAccountId: string;
  reference?: string | null;
}

export function buildPaymentEntry(input: PaymentPostingInput): JournalEntryDraft {
  if (!isPositive(input.amount)) {
    throw new ValidationError("A payment amount must be greater than zero.");
  }

  if (input.paymentAccountId === input.counterpartAccountId) {
    throw new ValidationError(
      "The payment account and the control account must be different, otherwise the entry has no effect.",
    );
  }

  const lines: JournalEntryDraft["lines"] =
    input.direction === "INBOUND"
      ? [
          // Money in: cash/bank rises, the customer owes less.
          {
            accountId: input.paymentAccountId,
            debit: input.amount,
            contactId: input.contactId,
            description: `Receipt ${input.paymentNumber}`,
          },
          {
            accountId: input.counterpartAccountId,
            credit: input.amount,
            contactId: input.contactId,
            description: `Receipt ${input.paymentNumber}`,
          },
        ]
      : [
          // Money out: we owe the vendor less, cash/bank falls.
          {
            accountId: input.counterpartAccountId,
            debit: input.amount,
            contactId: input.contactId,
            description: `Payment ${input.paymentNumber}`,
          },
          {
            accountId: input.paymentAccountId,
            credit: input.amount,
            contactId: input.contactId,
            description: `Payment ${input.paymentNumber}`,
          },
        ];

  return {
    journalId: input.journalId,
    date: input.paymentDate,
    reference: input.reference ?? input.paymentNumber,
    description:
      input.direction === "INBOUND"
        ? `Customer receipt ${input.paymentNumber}`
        : `Vendor payment ${input.paymentNumber}`,
    sourceType: "Payment",
    sourceId: input.paymentId,
    lines,
  };
}
