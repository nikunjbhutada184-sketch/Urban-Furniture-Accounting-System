import { PaymentDirection } from "@prisma/client";
import { z } from "zod";
import {
  dateString,
  decimalString,
  optionalDecimalString,
  optionalText,
  requiredText,
} from "@/modules/shared/zod-helpers";

/**
 * Standalone payment registration.
 *
 * The "register a payment from a bill" flow settles exactly one document. This
 * one starts from the money instead: a single receipt or payment that can clear
 * several of a contact's open documents at once, with anything left over held
 * as an unallocated advance.
 */

export const PAYMENT_DIRECTION_LABELS: Record<PaymentDirection, string> = {
  [PaymentDirection.INBOUND]: "Receive",
  [PaymentDirection.OUTBOUND]: "Send",
};

/** One line of the allocation table: how much of this payment clears a document. */
export const allocationLineSchema = z.object({
  documentId: requiredText("Document", 40),
  /** Amount applied to this document. Blank rows become "0" and are dropped. */
  amount: optionalDecimalString("Allocated amount"),
});

export const registerPaymentSchema = z
  .object({
    direction: z.nativeEnum(PaymentDirection, {
      errorMap: () => ({ message: "Choose whether money is received or sent." }),
    }),
    contactId: requiredText("Contact", 40),
    journalId: requiredText("Payment journal", 40),
    paymentDate: dateString("Payment date"),
    amount: decimalString("Amount", { scale: 2, allowZero: false }),
    reference: optionalText("Reference", 80),
    note: optionalText("Note", 500),
    // The allocation table submits its rows as a JSON string, because a
    // FormData cannot carry a nested array. Revived here so there is one
    // schema for both the form and the server.
    allocations: z.preprocess(
      (value) => (typeof value === "string" ? safeJsonParse(value) : (value ?? [])),
      z.array(allocationLineSchema),
    ),
  })
  /**
   * The allocation cannot exceed the payment. The reverse is fine: an
   * unallocated remainder is a legitimate advance, held on the payment.
   */
  .superRefine((value, context) => {
    const total = value.allocations.reduce((sum, line) => sum + Number(line.amount ?? "0"), 0);

    if (total > Number(value.amount) + 1e-9) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: `The allocated total (${total.toFixed(2)}) is more than the payment amount.`,
      });
    }
  });

export type RegisterStandalonePaymentInput = z.infer<typeof registerPaymentSchema>;

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/**
 * Rebuilds `allocations.<index>.<field>` form fields into an array.
 *
 * HTML forms cannot submit nested structures, so the allocation table names its
 * inputs that way and this turns them back into objects before Zod sees them.
 */
export function parseAllocationRows(raw: Record<string, unknown>): Record<string, unknown> {
  const rows: Record<string, Record<string, unknown>> = {};
  const rest: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const match = /^allocations\.(\d+)\.(.+)$/.exec(key);

    if (!match) {
      rest[key] = value;
      continue;
    }

    const index = match[1] ?? "0";
    const field = match[2] ?? "";
    rows[index] ??= {};
    rows[index][field] = value;
  }

  const allocations = Object.keys(rows)
    .sort((a, b) => Number(a) - Number(b))
    .map((index) => rows[index] ?? {})
    // A row the user left blank is not an allocation.
    .filter((row) => Number(row.amount ?? 0) > 0);

  return { ...rest, allocations };
}
