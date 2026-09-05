import { PaymentMethod, PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";
import {
  dateString,
  decimalString,
  optionalDateString,
  optionalId,
  optionalText,
  requiredText,
} from "@/modules/shared/zod-helpers";

export const PURCHASE_ORDER_SORT_FIELDS = ["number", "orderDate", "status", "amountTotal"] as const;
export type PurchaseOrderSortField = (typeof PURCHASE_ORDER_SORT_FIELDS)[number];

export const VENDOR_BILL_SORT_FIELDS = [
  "number",
  "invoiceDate",
  "dueDate",
  "status",
  "amountTotal",
  "amountResidual",
] as const;
export type VendorBillSortField = (typeof VENDOR_BILL_SORT_FIELDS)[number];

export const PURCHASE_ORDER_STATUS_OPTIONS = [
  { value: PurchaseOrderStatus.DRAFT, label: "Draft" },
  { value: PurchaseOrderStatus.CONFIRMED, label: "Confirmed" },
  { value: PurchaseOrderStatus.BILLED, label: "Billed" },
  { value: PurchaseOrderStatus.CANCELLED, label: "Cancelled" },
] as const;

export const INVOICE_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "POSTED", label: "Posted" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

/**
 * One line of a purchase order.
 *
 * Quantity and price are validated as positive decimals here and again by
 * database CHECK constraints, so a negative quantity cannot reach the ledger
 * by any route.
 */
export const purchaseOrderLineSchema = z.object({
  productId: optionalId(),
  description: requiredText("Line description", 300),
  quantity: decimalString("Quantity", { scale: 3, allowZero: false }),
  unitPrice: decimalString("Unit price", { scale: 4 }),
  taxId: optionalId(),
  analyticAccountId: optionalId(),
});

export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineSchema>;

/**
 * Lines arrive from the form as parallel arrays (`lines.0.quantity`, ...).
 * `parseLineRows` reassembles them before validation.
 */
export const purchaseOrderInputSchema = z.object({
  vendorId: requiredText("Vendor", 40),
  orderDate: dateString("Order date"),
  expectedDate: optionalDateString("Expected date"),
  reference: optionalText("Reference", 80),
  notes: optionalText("Notes", 2000),
  // The line editor submits lines as a JSON string, because a FormData cannot
  // carry a nested array. Revived here so there is one schema for both.
  lines: z.preprocess(
    (value) => (typeof value === "string" ? safeJsonParse(value) : value),
    z.array(purchaseOrderLineSchema).min(1, "Add at least one line to the purchase order."),
  ),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** Converting a confirmed purchase order into a vendor bill. */
export const convertToBillSchema = z.object({
  purchaseOrderId: requiredText("Purchase order", 40),
  journalId: requiredText("Journal", 40),
  invoiceDate: dateString("Invoice date"),
  dueDate: optionalDateString("Due date"),
  vendorReference: optionalText("Vendor reference", 80),
});

export type ConvertToBillInput = z.infer<typeof convertToBillSchema>;

/** Registering a payment against a vendor bill. */
export const registerPaymentSchema = z.object({
  billId: requiredText("Bill", 40),
  journalId: requiredText("Payment journal", 40),
  method: z.nativeEnum(PaymentMethod, {
    errorMap: () => ({ message: "Choose cash or bank." }),
  }),
  paymentDate: dateString("Payment date"),
  amount: decimalString("Amount", { scale: 2, allowZero: false }),
  reference: optionalText("Reference", 80),
});

export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/**
 * Rebuilds `lines[0][quantity]`-style form fields into an array.
 *
 * HTML forms cannot submit nested structures, so the line editor names its
 * inputs `lines.<index>.<field>` and this turns them back into objects before
 * Zod sees them.
 */
export function parseLineRows(raw: Record<string, unknown>): Record<string, unknown> {
  const lines: Record<string, Record<string, unknown>> = {};
  const rest: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const match = /^lines\.(\d+)\.(.+)$/.exec(key);
    if (!match) {
      rest[key] = value;
      continue;
    }

    const [, index, field] = match;
    if (index === undefined || field === undefined) continue;

    lines[index] ??= {};
    lines[index][field] = value;
  }

  const ordered = Object.keys(lines)
    .sort((a, b) => Number(a) - Number(b))
    .map((index) => lines[index] as Record<string, unknown>)
    // A line the user cleared out is dropped rather than failing validation.
    .filter(
      (line) => String(line.description ?? "").trim() !== "" || String(line.productId ?? "") !== "",
    );

  return { ...rest, lines: ordered };
}
