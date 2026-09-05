import { PaymentMethod, SalesOrderStatus } from "@prisma/client";
import { z } from "zod";
import {
  dateString,
  decimalString,
  optionalDateString,
  optionalId,
  optionalText,
  requiredText,
} from "@/modules/shared/zod-helpers";

export const SALES_ORDER_SORT_FIELDS = ["number", "orderDate", "status", "amountTotal"] as const;
export type SalesOrderSortField = (typeof SALES_ORDER_SORT_FIELDS)[number];

export const CUSTOMER_INVOICE_SORT_FIELDS = [
  "number",
  "invoiceDate",
  "dueDate",
  "status",
  "amountTotal",
  "amountResidual",
] as const;
export type CustomerInvoiceSortField = (typeof CUSTOMER_INVOICE_SORT_FIELDS)[number];

export const SALES_ORDER_STATUS_OPTIONS = [
  { value: SalesOrderStatus.DRAFT, label: "Draft" },
  { value: SalesOrderStatus.CONFIRMED, label: "Confirmed" },
  { value: SalesOrderStatus.INVOICED, label: "Invoiced" },
  { value: SalesOrderStatus.CANCELLED, label: "Cancelled" },
] as const;

/**
 * One line of a sales order.
 *
 * Quantity must be positive and price non-negative. Both rules are enforced
 * again by database CHECK constraints, so no route can write a negative line.
 */
export const salesOrderLineSchema = z.object({
  productId: optionalId(),
  description: requiredText("Line description", 300),
  quantity: decimalString("Quantity", { scale: 3, allowZero: false }),
  unitPrice: decimalString("Unit price", { scale: 4 }),
  taxId: optionalId(),
  analyticAccountId: optionalId(),
});

export type SalesOrderLineInput = z.infer<typeof salesOrderLineSchema>;

export const salesOrderInputSchema = z.object({
  customerId: requiredText("Customer", 40),
  orderDate: dateString("Order date"),
  reference: optionalText("Reference", 80),
  notes: optionalText("Notes", 2000),
  // Lines ride along as JSON: a FormData cannot carry a nested array.
  lines: z.preprocess(
    (value) => (typeof value === "string" ? safeJsonParse(value) : value),
    z.array(salesOrderLineSchema).min(1, "Add at least one line to the sales order."),
  ),
});

export type SalesOrderInput = z.infer<typeof salesOrderInputSchema>;

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** Generating a customer invoice from a confirmed sales order. */
export const convertToInvoiceSchema = z.object({
  salesOrderId: requiredText("Sales order", 40),
  journalId: requiredText("Journal", 40),
  invoiceDate: dateString("Invoice date"),
  dueDate: optionalDateString("Due date"),
  reference: optionalText("Reference", 80),
});

export type ConvertToInvoiceInput = z.infer<typeof convertToInvoiceSchema>;

/** Receiving a payment against a customer invoice. */
export const receivePaymentSchema = z.object({
  invoiceId: requiredText("Invoice", 40),
  journalId: requiredText("Payment journal", 40),
  method: z.nativeEnum(PaymentMethod, {
    errorMap: () => ({ message: "Choose cash or bank." }),
  }),
  paymentDate: dateString("Payment date"),
  amount: decimalString("Amount", { scale: 2, allowZero: false }),
  reference: optionalText("Reference", 80),
  note: optionalText("Note", 500),
});

export type ReceivePaymentInput = z.infer<typeof receivePaymentSchema>;
