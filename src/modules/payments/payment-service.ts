import {
  InvoiceStatus,
  type Payment,
  PaymentDirection,
  type PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import { type RegisterPaymentInput } from "@/modules/purchases/schemas";
import { postJournalEntry } from "@/server/accounting";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import {
  ConflictError,
  NotFoundError,
  OverAllocationError,
  ValidationError,
} from "@/server/errors";
import { add, isPositive, subtract, toAmountString, toMoney } from "@/server/money";
import { SEQUENCE_CODES, nextNumber } from "@/server/sequence/sequence-service";
import { buildPaymentEntry } from "./payment-posting";

/**
 * Payment service.
 *
 * Registering a payment against a vendor bill does four things in ONE database
 * transaction:
 *
 *   1. creates the payment,
 *   2. posts the journal entry through the accounting engine,
 *   3. allocates the payment against the bill,
 *   4. recomputes the bill's paid/residual amounts and status.
 *
 * If any step fails the whole thing rolls back: there is never a payment
 * without its ledger entry, or a settled bill without a payment.
 */

/**
 * Registers and posts a payment against a single vendor bill.
 *
 * Guards:
 *   - the bill must be posted and not already fully paid,
 *   - the amount must be positive,
 *   - the amount may not exceed the bill's outstanding balance,
 *   - the journal must be a cash or bank journal with a payment account.
 */
export async function registerVendorBillPayment(
  tx: DbClient,
  input: RegisterPaymentInput,
  context: { userId?: string | null } = {},
): Promise<Payment> {
  const bill = await tx.vendorBill.findUnique({
    where: { id: input.billId },
    include: { vendor: { select: { id: true, name: true, payableAccountId: true } } },
  });

  if (!bill) throw new NotFoundError("Vendor bill", input.billId);

  // A draft bill has no payable balance yet; a cancelled one never will.
  if (bill.status === InvoiceStatus.DRAFT) {
    throw new ConflictError(
      `Bill ${bill.number} has not been posted yet, so there is nothing to pay. Post it first.`,
    );
  }
  if (bill.status === InvoiceStatus.CANCELLED) {
    throw new ConflictError(`Bill ${bill.number} is cancelled and cannot be paid.`);
  }
  if (bill.status === InvoiceStatus.PAID) {
    throw new ConflictError(`Bill ${bill.number} is already fully paid.`);
  }

  const amount = toMoney(input.amount);
  if (!isPositive(amount)) {
    throw new ValidationError("The payment amount must be greater than zero.", {
      fieldErrors: { amount: "Enter an amount greater than zero." },
    });
  }

  const residual = toMoney(bill.amountResidual);

  // Never pay more than is outstanding.
  if (amount.greaterThan(residual)) {
    throw new OverAllocationError(
      `bill ${bill.number}`,
      toAmountString(residual),
      toAmountString(amount),
    );
  }

  const journal = await tx.journal.findUnique({
    where: { id: input.journalId },
    select: { id: true, name: true, type: true, isArchived: true, paymentAccountId: true },
  });

  if (!journal) throw new NotFoundError("Journal", input.journalId);
  if (journal.isArchived) {
    throw new ValidationError(`${journal.name} is archived and cannot be used.`);
  }
  if (journal.type !== "BANK" && journal.type !== "CASH") {
    throw new ValidationError(
      `${journal.name} is not a bank or cash journal, so payments cannot be recorded through it.`,
      { fieldErrors: { journalId: "Choose a bank or cash journal." } },
    );
  }
  if (!journal.paymentAccountId) {
    throw new ValidationError(
      `${journal.name} has no payment account configured. Set the cash or bank account on the journal.`,
      { fieldErrors: { journalId: "This journal has no payment account." } },
    );
  }

  const settings = await tx.companySettings.findUnique({ where: { id: "company" } });
  const payableAccountId = bill.vendor.payableAccountId ?? settings?.defaultPayableAccountId;

  if (!payableAccountId) {
    throw new ValidationError(
      `No payable account is set for ${bill.vendor.name}, and no company default is configured.`,
    );
  }

  const number = await nextNumber(tx, SEQUENCE_CODES.PAYMENT_OUTBOUND);

  const payment = await tx.payment.create({
    data: {
      number,
      direction: PaymentDirection.OUTBOUND,
      method: input.method as PaymentMethod,
      status: PaymentStatus.DRAFT,
      contactId: bill.vendorId,
      journalId: journal.id,
      paymentDate: input.paymentDate,
      amount,
      amountUnallocated: 0,
      reference: input.reference,
      createdById: context.userId ?? null,
    },
  });

  // Dr Creditors / Cr Bank or Cash -- built here, balanced and posted by the
  // accounting engine.
  const draft = buildPaymentEntry({
    journalId: journal.id,
    paymentNumber: payment.number,
    paymentId: payment.id,
    paymentDate: input.paymentDate,
    direction: PaymentDirection.OUTBOUND,
    amount,
    contactId: bill.vendorId,
    paymentAccountId: journal.paymentAccountId,
    counterpartAccountId: payableAccountId,
    reference: input.reference,
  });

  const entry = await postJournalEntry(tx, draft, { userId: context.userId });

  await tx.payment.update({
    where: { id: payment.id },
    data: { status: PaymentStatus.POSTED, journalEntryId: entry.id },
  });

  await tx.paymentAllocation.create({
    data: { paymentId: payment.id, vendorBillId: bill.id, amount },
  });

  await recomputeVendorBillSettlement(tx, bill.id);

  await recordAudit(
    tx,
    {
      action: "pay",
      entity: "VendorBill",
      entityId: bill.id,
      summary: `Registered payment ${payment.number} of ${toAmountString(amount)} against bill ${bill.number}`,
      metadata: { paymentId: payment.id, journalEntryId: entry.id },
    },
    context,
  );

  return payment;
}

/**
 * Recomputes a bill's paid and outstanding amounts from its allocations, and
 * moves its status accordingly.
 *
 * Derived from the allocations rather than incremented, so the figures cannot
 * drift out of step with the payments that produced them.
 */
export async function recomputeVendorBillSettlement(
  tx: DbClient,
  billId: string,
): Promise<{ amountPaid: string; amountResidual: string; status: InvoiceStatus }> {
  const bill = await tx.vendorBill.findUnique({
    where: { id: billId },
    select: { id: true, amountTotal: true, status: true },
  });
  if (!bill) throw new NotFoundError("Vendor bill", billId);

  const allocations = await tx.paymentAllocation.findMany({
    where: { vendorBillId: billId, payment: { status: PaymentStatus.POSTED } },
    select: { amount: true },
  });

  let amountPaid = toMoney(0);
  for (const allocation of allocations) {
    amountPaid = add(amountPaid, allocation.amount);
  }

  const amountTotal = toMoney(bill.amountTotal);
  const amountResidual = subtract(amountTotal, amountPaid);

  // Cancelled bills keep their status; everything else follows the money.
  const status =
    bill.status === InvoiceStatus.CANCELLED
      ? InvoiceStatus.CANCELLED
      : amountResidual.isZero()
        ? InvoiceStatus.PAID
        : isPositive(amountPaid)
          ? InvoiceStatus.PARTIALLY_PAID
          : InvoiceStatus.POSTED;

  await tx.vendorBill.update({
    where: { id: billId },
    data: { amountPaid, amountResidual, status },
  });

  return {
    amountPaid: toAmountString(amountPaid),
    amountResidual: toAmountString(amountResidual),
    status,
  };
}

export async function listPaymentsForContact(contactId: string, client: DbClient = prisma) {
  return client.payment.findMany({
    where: { contactId, status: PaymentStatus.POSTED },
    orderBy: { paymentDate: "desc" },
    select: {
      id: true,
      number: true,
      paymentDate: true,
      amount: true,
      method: true,
      direction: true,
      reference: true,
    },
  });
}
