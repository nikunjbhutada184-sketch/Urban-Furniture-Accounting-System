"use server";

import { receiveCustomerInvoicePayment } from "@/modules/payments/customer-payment-service";
import { type ActionState } from "@/modules/shared/action-state";
import { runAction, runFormAction } from "@/modules/shared/run-action";
import {
  cancelCustomerInvoice,
  createInvoiceFromSalesOrder,
  postCustomerInvoice,
} from "./customer-invoice-service";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  updateSalesOrder,
} from "./sales-order-service";
import { convertToInvoiceSchema, receivePaymentSchema, salesOrderInputSchema } from "./schemas";

/**
 * Sales workflow server actions.
 *
 * Authorisation, validation and the transaction boundary come from the shared
 * pipeline. None of these contains accounting logic -- posting is delegated to
 * the services, which delegate to the AccountingService.
 */

// ---------------------------------------------------------------- orders

export async function createSalesOrderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "transaction:create",
    schema: salesOrderInputSchema,
    formData,
    handler: (tx, input, actor) => createSalesOrder(tx, input, { userId: actor.id }),
    successMessage: "Sales order created.",
    revalidate: ["/sales/orders"],
  });
}

export async function updateSalesOrderAction(
  id: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "transaction:update",
    schema: salesOrderInputSchema,
    formData,
    handler: (tx, input, actor) => updateSalesOrder(tx, id, input, { userId: actor.id }),
    successMessage: "Sales order updated.",
    revalidate: ["/sales/orders", `/sales/orders/${id}`],
  });
}

export async function confirmSalesOrderAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:update",
    handler: (tx, actor) => confirmSalesOrder(tx, id, { userId: actor.id }),
    successMessage: "Sales order confirmed.",
    revalidate: ["/sales/orders", `/sales/orders/${id}`],
  });
}

export async function cancelSalesOrderAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:cancel",
    handler: (tx, actor) => cancelSalesOrder(tx, id, { userId: actor.id }),
    successMessage: "Sales order cancelled.",
    revalidate: ["/sales/orders", `/sales/orders/${id}`],
  });
}

// ---------------------------------------------------------------- invoices

export async function convertToInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runFormAction({
    permission: "transaction:create",
    schema: convertToInvoiceSchema,
    formData,
    handler: (tx, input, actor) => createInvoiceFromSalesOrder(tx, input, { userId: actor.id }),
    successMessage: "Customer invoice created.",
    revalidate: ["/sales/orders", "/sales/invoices"],
  });
}

/** Posting writes the ledger, so it requires `transaction:post`. */
export async function postCustomerInvoiceAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:post",
    handler: (tx, actor) => postCustomerInvoice(tx, id, { userId: actor.id }),
    successMessage: "Invoice posted to the ledger.",
    revalidate: ["/sales/invoices", `/sales/invoices/${id}`],
  });
}

export async function cancelCustomerInvoiceAction(id: string): Promise<ActionState> {
  return runAction({
    permission: "transaction:cancel",
    handler: (tx, actor) => cancelCustomerInvoice(tx, id, { userId: actor.id }),
    successMessage: "Invoice cancelled.",
    revalidate: ["/sales/invoices", `/sales/invoices/${id}`],
  });
}

// ---------------------------------------------------------------- payments

export async function receiveInvoicePaymentAction(
  invoiceId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  formData.set("invoiceId", invoiceId);

  return runFormAction({
    permission: "payment:post",
    schema: receivePaymentSchema,
    formData,
    handler: (tx, input, actor) => receiveCustomerInvoicePayment(tx, input, { userId: actor.id }),
    successMessage: "Payment received and posted.",
    revalidate: ["/sales/invoices", `/sales/invoices/${invoiceId}`, "/sales/outstanding"],
  });
}
