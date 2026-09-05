import { InvoiceStatus, type Payment, PaymentDirection, PaymentStatus } from "@prisma/client";
import { type ReceivePaymentInput } from "@/modules/sales/schemas";
import { postJournalEntry } from "@/server/accounting";
import { getContactBalances } from "@/server/accounting/ledger-service";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import {
  ConflictError,
  NotFoundError,
  OverAllocationError,
  ValidationError,
} from "@/server/errors";
import { type Decimal, add, isPositive, subtract, toAmountString, toMoney } from "@/server/money";
import { SEQUENCE_CODES, nextNumber } from "@/server/sequence/sequence-service";
import { buildPaymentEntry } from "./payment-posting";

/**
 * Customer receipts.
 *
 * Registering a receipt against an invoice does four things in ONE database
 * transaction: create the payment, post the journal entry through the
 * accounting engine, allocate it against the invoice, and recompute the
 * invoice's paid/outstanding amounts and status.
 *
 * Any failure rolls all of it back -- there is never a receipt without its
 * ledger entry, nor a settled invoice without a receipt.
 */
export async function receiveCustomerInvoicePayment(
  tx: DbClient,
  input: ReceivePaymentInput,
  context: { userId?: string | null } = {},
): Promise<Payment> {
  const invoice = await tx.customerInvoice.findUnique({
    where: { id: input.invoiceId },
    include: { customer: { select: { id: true, name: true, receivableAccountId: true } } },
  });

  if (!invoice) throw new NotFoundError("Customer invoice", input.invoiceId);

  // A draft invoice has no receivable yet; a cancelled one never will.
  if (invoice.status === InvoiceStatus.DRAFT) {
    throw new ConflictError(
      `Invoice ${invoice.number} has not been posted yet, so there is nothing to collect. Post it first.`,
    );
  }
  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw new ConflictError(`Invoice ${invoice.number} is cancelled and cannot be paid.`);
  }
  // Blocks a duplicate payment against an already-settled invoice.
  if (invoice.status === InvoiceStatus.PAID) {
    throw new ConflictError(`Invoice ${invoice.number} is already fully paid.`);
  }

  const amount = toMoney(input.amount);
  if (!isPositive(amount)) {
    throw new ValidationError("The payment amount must be greater than zero.", {
      fieldErrors: { amount: "Enter an amount greater than zero." },
    });
  }

  const residual = toMoney(invoice.amountResidual);

  // Never collect more than is outstanding.
  if (amount.greaterThan(residual)) {
    throw new OverAllocationError(
      `invoice ${invoice.number}`,
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
      `${journal.name} is not a bank or cash journal, so receipts cannot be recorded through it.`,
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
  const receivableAccountId =
    invoice.customer.receivableAccountId ?? settings?.defaultReceivableAccountId;

  if (!receivableAccountId) {
    throw new ValidationError(
      `No receivable account is set for ${invoice.customer.name}, and no company default is configured.`,
    );
  }

  const number = await nextNumber(tx, SEQUENCE_CODES.PAYMENT_INBOUND);

  const payment = await tx.payment.create({
    data: {
      number,
      direction: PaymentDirection.INBOUND,
      method: input.method,
      status: PaymentStatus.DRAFT,
      contactId: invoice.customerId,
      journalId: journal.id,
      paymentDate: input.paymentDate,
      amount,
      amountUnallocated: 0,
      reference: input.reference,
      createdById: context.userId ?? null,
    },
  });

  // Dr Bank or Cash / Cr Debtors -- built here, balanced and posted by the
  // accounting engine. No accounting arithmetic happens in this module.
  const draft = buildPaymentEntry({
    journalId: journal.id,
    paymentNumber: payment.number,
    paymentId: payment.id,
    paymentDate: input.paymentDate,
    direction: PaymentDirection.INBOUND,
    amount,
    contactId: invoice.customerId,
    paymentAccountId: journal.paymentAccountId,
    counterpartAccountId: receivableAccountId,
    reference: input.reference,
  });

  const entry = await postJournalEntry(tx, draft, { userId: context.userId });

  await tx.payment.update({
    where: { id: payment.id },
    data: { status: PaymentStatus.POSTED, journalEntryId: entry.id },
  });

  await tx.paymentAllocation.create({
    data: { paymentId: payment.id, customerInvoiceId: invoice.id, amount },
  });

  await recomputeCustomerInvoiceSettlement(tx, invoice.id);

  await recordAudit(
    tx,
    {
      action: "pay",
      entity: "CustomerInvoice",
      entityId: invoice.id,
      summary: `Received payment ${payment.number} of ${toAmountString(amount)} against invoice ${invoice.number}`,
      metadata: { paymentId: payment.id, journalEntryId: entry.id },
    },
    context,
  );

  return payment;
}

/**
 * Recomputes an invoice's paid and outstanding amounts from its allocations.
 *
 * Derived, never incremented, so the figures cannot drift away from the
 * payments that produced them.
 */
export async function recomputeCustomerInvoiceSettlement(
  tx: DbClient,
  invoiceId: string,
): Promise<{ amountPaid: string; amountResidual: string; status: InvoiceStatus }> {
  const invoice = await tx.customerInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, amountTotal: true, status: true },
  });
  if (!invoice) throw new NotFoundError("Customer invoice", invoiceId);

  const allocations = await tx.paymentAllocation.findMany({
    where: { customerInvoiceId: invoiceId, payment: { status: PaymentStatus.POSTED } },
    select: { amount: true },
  });

  let amountPaid = toMoney(0);
  for (const allocation of allocations) {
    amountPaid = add(amountPaid, allocation.amount);
  }

  const amountTotal = toMoney(invoice.amountTotal);
  const amountResidual = subtract(amountTotal, amountPaid);

  const status =
    invoice.status === InvoiceStatus.CANCELLED
      ? InvoiceStatus.CANCELLED
      : amountResidual.isZero()
        ? InvoiceStatus.PAID
        : isPositive(amountPaid)
          ? InvoiceStatus.PARTIALLY_PAID
          : InvoiceStatus.POSTED;

  await tx.customerInvoice.update({
    where: { id: invoiceId },
    data: { amountPaid, amountResidual, status },
  });

  return {
    amountPaid: toAmountString(amountPaid),
    amountResidual: toAmountString(amountResidual),
    status,
  };
}

export interface CustomerOutstandingRow {
  contactId: string;
  name: string;
  /** Outstanding per the documents. */
  outstanding: string;
  /** Outstanding per the ledger's receivable accounts. */
  ledgerBalance: string;
  openInvoices: number;
  overdueInvoices: number;
}

/**
 * Customer outstanding balances.
 *
 * Reports both the document view (sum of invoice residuals) and the ledger view
 * (receivable account balance per contact). They should agree; showing both
 * makes any divergence visible instead of hidden.
 */
export async function getCustomerOutstanding(
  client: DbClient = prisma,
  asAt: Date = new Date(),
): Promise<CustomerOutstandingRow[]> {
  const openInvoices = await client.customerInvoice.findMany({
    where: { status: { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID] } },
    select: {
      customerId: true,
      amountResidual: true,
      dueDate: true,
      customer: { select: { name: true } },
    },
  });

  const ledgerBalances = await getContactBalances(client, {
    accountKind: "RECEIVABLE",
    asAt,
  });
  const ledgerByContact = new Map(ledgerBalances.map((row) => [row.contactId, row.balance]));

  const byContact = new Map<
    string,
    { name: string; outstanding: Decimal; open: number; overdue: number }
  >();

  for (const invoice of openInvoices) {
    const current = byContact.get(invoice.customerId) ?? {
      name: invoice.customer.name,
      outstanding: toMoney(0),
      open: 0,
      overdue: 0,
    };

    current.outstanding = add(current.outstanding, invoice.amountResidual);
    current.open += 1;
    if (invoice.dueDate && invoice.dueDate.getTime() < asAt.getTime()) current.overdue += 1;

    byContact.set(invoice.customerId, current);
  }

  return [...byContact.entries()]
    .map(([contactId, row]) => ({
      contactId,
      name: row.name,
      outstanding: toAmountString(row.outstanding),
      ledgerBalance: toAmountString(ledgerByContact.get(contactId) ?? 0),
      openInvoices: row.open,
      overdueInvoices: row.overdue,
    }))
    .sort((a, b) => Number(b.outstanding) - Number(a.outstanding));
}

/** Outstanding for one customer, for the portal and the contact page. */
export async function getContactOutstanding(
  contactId: string,
  client: DbClient = prisma,
): Promise<{ outstanding: string; openInvoices: number }> {
  const invoices = await client.customerInvoice.findMany({
    where: {
      customerId: contactId,
      status: { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID] },
    },
    select: { amountResidual: true },
  });

  let outstanding = toMoney(0);
  for (const invoice of invoices) outstanding = add(outstanding, invoice.amountResidual);

  return { outstanding: toAmountString(outstanding), openInvoices: invoices.length };
}
