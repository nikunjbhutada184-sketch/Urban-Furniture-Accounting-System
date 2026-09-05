"use server";

import { registerVendorBillPayment } from "@/modules/payments/payment-service";
import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import { formDataToObject } from "@/modules/shared/zod-helpers";
import {
  cancelPurchaseOrder,
  confirmPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
} from "./purchase-order-service";
import {
  convertToBillSchema,
  parseLineRows,
  purchaseOrderInputSchema,
  registerPaymentSchema,
} from "./schemas";
import {
  cancelVendorBill,
  createBillFromPurchaseOrder,
  postVendorBill,
} from "./vendor-bill-service";

/**
 * Purchase workflow server actions.
 *
 * Every one of these authorises, validates and runs inside a transaction via
 * the shared pipeline. None of them contains accounting logic: posting is
 * delegated to the services, which delegate to the accounting engine.
 */

// ---------------------------------------------------------------- orders

export async function createPurchaseOrderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "transaction:create",
    schema: purchaseOrderInputSchema,
    // Rebuild `lines.0.quantity`-style fields into an array first.
    formData: withParsedLines(formData),
    handler: (tx, input, actor) => createPurchaseOrder(tx, input, { userId: actor.id }),
    successMessage: "Purchase order created.",
    revalidate: ["/purchases/orders"],
  });
}

export async function updatePurchaseOrderAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "transaction:update",
    schema: purchaseOrderInputSchema,
    formData: withParsedLines(formData),
    handler: (tx, input, actor) => updatePurchaseOrder(tx, id, input, { userId: actor.id }),
    successMessage: "Purchase order updated.",
    revalidate: ["/purchases/orders", `/purchases/orders/${id}`],
  });
}

export async function confirmPurchaseOrderAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:update",
    handler: (tx, actor) => confirmPurchaseOrder(tx, id, { userId: actor.id }),
    successMessage: "Purchase order confirmed.",
    revalidate: ["/purchases/orders", `/purchases/orders/${id}`],
  });
}

export async function cancelPurchaseOrderAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:cancel",
    handler: (tx, actor) => cancelPurchaseOrder(tx, id, { userId: actor.id }),
    successMessage: "Purchase order cancelled.",
    revalidate: ["/purchases/orders", `/purchases/orders/${id}`],
  });
}

// ---------------------------------------------------------------- bills

export async function convertToBillAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "transaction:create",
    schema: convertToBillSchema,
    formData,
    handler: (tx, input, actor) => createBillFromPurchaseOrder(tx, input, { userId: actor.id }),
    successMessage: "Vendor bill created.",
    revalidate: ["/purchases/orders", "/purchases/bills"],
  });
}

/** Posting is the step that writes the ledger, so it needs `transaction:post`. */
export async function postVendorBillAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:post",
    handler: (tx, actor) => postVendorBill(tx, id, { userId: actor.id }),
    successMessage: "Bill posted to the ledger.",
    revalidate: ["/purchases/bills", `/purchases/bills/${id}`],
  });
}

export async function cancelVendorBillAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:cancel",
    handler: (tx, actor) => cancelVendorBill(tx, id, { userId: actor.id }),
    successMessage: "Bill cancelled.",
    revalidate: ["/purchases/bills", `/purchases/bills/${id}`],
  });
}

// ---------------------------------------------------------------- payments

export async function registerBillPaymentAction(
  billId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  formData.set("billId", billId);

  return runFormAction({
    permission: "payment:post",
    schema: registerPaymentSchema,
    formData,
    handler: (tx, input, actor) => registerVendorBillPayment(tx, input, { userId: actor.id }),
    successMessage: "Payment registered and posted.",
    revalidate: ["/purchases/bills", `/purchases/bills/${billId}`, "/payments"],
  });
}

/**
 * `runFormAction` parses a FormData with Zod, but purchase-order lines arrive
 * as flat `lines.<n>.<field>` keys. This repackages them into a FormData-like
 * object the schema understands.
 */
function withParsedLines(formData: FormData): FormData {
  const parsed = parseLineRows(formDataToObject(formData));

  const rebuilt = new FormData();
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "lines") continue;
    if (typeof value === "string") rebuilt.set(key, value);
  }

  // FormData cannot hold arrays, so the lines ride along as JSON and are
  // revived by the schema's preprocessing in `purchaseOrderFormSchema`.
  rebuilt.set("lines", JSON.stringify(parsed.lines ?? []));
  return rebuilt;
}
