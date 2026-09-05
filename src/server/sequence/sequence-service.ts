import { type DbClient } from "@/server/db/prisma";
import { NotFoundError } from "@/server/errors";

/**
 * Document numbering.
 *
 * `nextValue` is incremented with a single atomic UPDATE ... RETURNING inside
 * the caller's transaction. That row-level lock serialises concurrent writers,
 * so two documents can never receive the same number.
 *
 * MUST be called with the transaction client (`tx`), not the bare singleton, so
 * that a rolled-back document also rolls back the number it consumed.
 */

export const SEQUENCE_CODES = {
  PURCHASE_ORDER: "purchase_order",
  VENDOR_BILL: "vendor_bill",
  SALES_ORDER: "sales_order",
  CUSTOMER_INVOICE: "customer_invoice",
  PAYMENT_INBOUND: "payment_inbound",
  PAYMENT_OUTBOUND: "payment_outbound",
  JOURNAL_ENTRY: "journal_entry",
} as const;

export type SequenceCode = (typeof SEQUENCE_CODES)[keyof typeof SEQUENCE_CODES] | (string & {});

export function formatSequenceNumber(prefix: string, value: number, padding: number): string {
  return `${prefix}${String(value).padStart(padding, "0")}`;
}

/**
 * Consumes the next number for `code` and returns the formatted document
 * number (e.g. "INV/2026/00042").
 */
export async function nextNumber(tx: DbClient, code: SequenceCode): Promise<string> {
  const sequence = await tx.sequence
    .update({
      where: { code },
      data: { nextValue: { increment: 1 } },
      select: { prefix: true, padding: true, nextValue: true },
    })
    .catch(() => null);

  if (!sequence) {
    throw new NotFoundError("Sequence", code);
  }

  // `nextValue` returned is the value AFTER increment, so the number we just
  // consumed is one less.
  const consumed = sequence.nextValue - 1;
  return formatSequenceNumber(sequence.prefix, consumed, sequence.padding);
}
