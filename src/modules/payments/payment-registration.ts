import {
  InvoiceStatus,
  type Payment,
  PaymentDirection,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import { postJournalEntry } from "@/server/accounting";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { NotFoundError, OverAllocationError, ValidationError } from "@/server/errors";
import {
  type Decimal,
  ZERO,
  add,
  isPositive,
  subtract,
  toAmountString,
  toMoney,
} from "@/server/money";
import { SEQUENCE_CODES, nextNumber } from "@/server/sequence/sequence-service";
import { recomputeCustomerInvoiceSettlement } from "./customer-payment-service";
import { buildPaymentEntry } from "./payment-posting";
import { recomputeVendorBillSettlement } from "./payment-service";
import { type RegisterStandalonePaymentInput } from "./schemas";

/**
 * Standalone payment registration.
 *
 * Starts from the money rather than the document: one receipt or payment,
 * settling any number of the contact's open documents, with any remainder held
 * on the payment as an unallocated advance.
 *
 * Everything happens in ONE transaction — the payment, its journal entry, every
 * allocation, and the recomputed status of every document touched. A failure
 * anywhere rolls all of it back, so there is never a payment without its ledger
 * entry, nor a document marked paid by an allocation that did not commit.
 */

export interface OpenDocumentRow {
  id: string;
  number: string;
  date: Date;
  dueDate: Date | null;
  total: string;
  residual: string;
}

/**
 * The contact's documents that this direction of payment can settle.
 *
 * INBOUND clears customer invoices, OUTBOUND clears vendor bills. Only posted
 * and part-paid documents have a balance to clear; drafts and cancelled ones
 * never do.
 */
export async function listOpenDocuments(
  params: { contactId: string; direction: PaymentDirection },
  client: DbClient = prisma,
): Promise<OpenDocumentRow[]> {
  const open = { in: [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID] };

  if (params.direction === PaymentDirection.INBOUND) {
    const invoices = await client.customerInvoice.findMany({
      where: { customerId: params.contactId, status: open },
      orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
      select: {
        id: true,
        number: true,
        invoiceDate: true,
        dueDate: true,
        amountTotal: true,
        amountResidual: true,
      },
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      date: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: toAmountString(invoice.amountTotal),
      residual: toAmountString(invoice.amountResidual),
    }));
  }

  const bills = await client.vendorBill.findMany({
    where: { vendorId: params.contactId, status: open },
    orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
    select: {
      id: true,
      number: true,
      invoiceDate: true,
      dueDate: true,
      amountTotal: true,
      amountResidual: true,
    },
  });

  return bills.map((bill) => ({
    id: bill.id,
    number: bill.number,
    date: bill.invoiceDate,
    dueDate: bill.dueDate,
    total: toAmountString(bill.amountTotal),
    residual: toAmountString(bill.amountResidual),
  }));
}

export async function registerPayment(
  tx: DbClient,
  input: RegisterStandalonePaymentInput,
  context: { userId?: string | null } = {},
): Promise<Payment> {
  const amount = toMoney(input.amount);
  if (!isPositive(amount)) {
    throw new ValidationError("The payment amount must be greater than zero.", {
      fieldErrors: { amount: "Enter an amount greater than zero." },
    });
  }

  const contact = await tx.contact.findUnique({
    where: { id: input.contactId },
    select: {
      id: true,
      name: true,
      isArchived: true,
      receivableAccountId: true,
      payableAccountId: true,
    },
  });

  if (!contact) throw new NotFoundError("Contact", input.contactId);
  if (contact.isArchived) {
    throw new ValidationError(`${contact.name} is archived and cannot be transacted with.`, {
      fieldErrors: { contactId: "This contact is archived." },
    });
  }

  const journal = await tx.journal.findUnique({
    where: { id: input.journalId },
    select: { id: true, name: true, type: true, isArchived: true, paymentAccountId: true },
  });

  if (!journal) throw new NotFoundError("Journal", input.journalId);
  if (journal.isArchived) {
    throw new ValidationError(`${journal.name} is archived and cannot be used.`, {
      fieldErrors: { journalId: "This journal is archived." },
    });
  }
  if (journal.type !== "BANK" && journal.type !== "CASH") {
    throw new ValidationError(
      `${journal.name} is not a bank or cash journal, so money cannot move through it.`,
      { fieldErrors: { journalId: "Choose a bank or cash journal." } },
    );
  }
  if (!journal.paymentAccountId) {
    throw new ValidationError(
      `${journal.name} has no payment account configured. Set the cash or bank account on the journal.`,
      { fieldErrors: { journalId: "This journal has no payment account." } },
    );
  }

  const isInbound = input.direction === PaymentDirection.INBOUND;
  const settings = await tx.companySettings.findUnique({ where: { id: "company" } });

  const counterpartAccountId = isInbound
    ? (contact.receivableAccountId ?? settings?.defaultReceivableAccountId)
    : (contact.payableAccountId ?? settings?.defaultPayableAccountId);

  if (!counterpartAccountId) {
    throw new ValidationError(
      `No ${isInbound ? "receivable" : "payable"} account is set for ${contact.name}, and no company default is configured.`,
    );
  }

  // Every allocation is checked against the document's *current* residual,
  // read inside this transaction — never against a figure the browser sent.
  const allocations = await resolveAllocations(tx, {
    contactId: contact.id,
    direction: input.direction,
    lines: input.allocations,
  });

  let allocated = ZERO;
  for (const allocation of allocations) allocated = add(allocated, allocation.amount);

  if (allocated.greaterThan(amount)) {
    throw new OverAllocationError(
      "this payment",
      toAmountString(amount),
      toAmountString(allocated),
    );
  }

  const number = await nextNumber(
    tx,
    isInbound ? SEQUENCE_CODES.PAYMENT_INBOUND : SEQUENCE_CODES.PAYMENT_OUTBOUND,
  );

  const payment = await tx.payment.create({
    data: {
      number,
      direction: input.direction,
      method: journal.type === "CASH" ? PaymentMethod.CASH : PaymentMethod.BANK,
      status: PaymentStatus.DRAFT,
      contactId: contact.id,
      journalId: journal.id,
      paymentDate: input.paymentDate,
      amount,
      // Whatever is not applied to a document stays on account as an advance.
      amountUnallocated: subtract(amount, allocated),
      reference: input.reference,
      notes: input.note,
      createdById: context.userId ?? null,
    },
  });

  // The ledger entry is for the FULL amount, allocated or not: the money moved.
  const draft = buildPaymentEntry({
    journalId: journal.id,
    paymentNumber: payment.number,
    paymentId: payment.id,
    paymentDate: input.paymentDate,
    direction: input.direction,
    amount,
    contactId: contact.id,
    paymentAccountId: journal.paymentAccountId,
    counterpartAccountId,
    reference: input.reference,
  });

  const entry = await postJournalEntry(tx, draft, { userId: context.userId });

  // Return the row as it stands AFTER posting. Returning the pre-update
  // snapshot would hand callers a payment that still says DRAFT with no
  // journal entry attached, which is never what they mean by "the payment".
  const posted = await tx.payment.update({
    where: { id: payment.id },
    data: { status: PaymentStatus.POSTED, journalEntryId: entry.id },
  });

  for (const allocation of allocations) {
    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        ...(isInbound
          ? { customerInvoiceId: allocation.documentId }
          : { vendorBillId: allocation.documentId }),
        amount: allocation.amount,
      },
    });

    // Recompute rather than increment, so a document's paid/residual figures
    // can never drift from the allocations that produced them.
    if (isInbound) {
      await recomputeCustomerInvoiceSettlement(tx, allocation.documentId);
    } else {
      await recomputeVendorBillSettlement(tx, allocation.documentId);
    }
  }

  await recordAudit(
    tx,
    {
      action: "pay",
      entity: "Payment",
      entityId: payment.id,
      summary: `${isInbound ? "Received" : "Paid"} ${toAmountString(amount)} ${
        isInbound ? "from" : "to"
      } ${contact.name} (${payment.number}), settling ${allocations.length} document(s)`,
      metadata: {
        journalEntryId: entry.id,
        allocated: toAmountString(allocated),
        documents: allocations.map((allocation) => allocation.number),
      },
    },
    context,
  );

  return posted;
}

interface ResolvedAllocation {
  documentId: string;
  number: string;
  amount: Decimal;
}

/**
 * Validates each requested allocation against the live document.
 *
 * Refuses a document that is not the contact's, is not open, or would be
 * over-allocated — a forged id in the form cannot reach another contact's
 * invoice.
 */
async function resolveAllocations(
  tx: DbClient,
  params: {
    contactId: string;
    direction: PaymentDirection;
    lines: { documentId: string; amount: string }[];
  },
): Promise<ResolvedAllocation[]> {
  if (params.lines.length === 0) return [];

  const open = await listOpenDocuments(
    { contactId: params.contactId, direction: params.direction },
    tx,
  );
  const byId = new Map(open.map((document) => [document.id, document]));

  const seen = new Set<string>();
  const resolved: ResolvedAllocation[] = [];

  for (const line of params.lines) {
    const amount = toMoney(line.amount);
    if (!isPositive(amount)) continue;

    if (seen.has(line.documentId)) {
      throw new ValidationError("The same document cannot be allocated twice on one payment.");
    }
    seen.add(line.documentId);

    const document = byId.get(line.documentId);
    if (!document) {
      throw new ValidationError(
        "One of the selected documents is not an open document for this contact.",
      );
    }

    const residual = toMoney(document.residual);
    if (amount.greaterThan(residual)) {
      throw new OverAllocationError(
        `${params.direction === PaymentDirection.INBOUND ? "invoice" : "bill"} ${document.number}`,
        document.residual,
        toAmountString(amount),
      );
    }

    resolved.push({ documentId: document.id, number: document.number, amount });
  }

  return resolved;
}
