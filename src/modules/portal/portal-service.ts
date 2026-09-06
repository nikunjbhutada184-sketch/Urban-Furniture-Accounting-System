import { InvoiceStatus, PaymentDirection } from "@prisma/client";
import { type DbClient, prisma } from "@/server/db/prisma";
import { type Decimal, ZERO, add, toAmountString, toMoney } from "@/server/money";

/**
 * The contact portal's read model.
 *
 * Every function here takes a `contactId` and applies it as a WHERE clause, so
 * isolation is enforced by the query itself rather than by remembering to check
 * afterwards. Callers get the id from the session — never from the URL — so
 * there is no id for a portal user to tamper with.
 *
 * A portal user is bound to exactly one contact by a unique column on `User`,
 * which is what makes that safe.
 */

const OPEN_STATUSES = [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID];
const VISIBLE_STATUSES = [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID];

export interface PortalDocumentRow {
  id: string;
  number: string;
  date: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  total: string;
  paid: string;
  outstanding: string;
  isOverdue: boolean;
}

export interface PortalOverview {
  contactName: string;
  outstandingInvoices: string;
  outstandingBills: string;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  paidThisYear: string;
}

function toRow(document: {
  id: string;
  number: string;
  date: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  amountTotal: Decimal;
  amountPaid: Decimal;
  amountResidual: Decimal;
}): PortalDocumentRow {
  const residual = toMoney(document.amountResidual);

  return {
    id: document.id,
    number: document.number,
    date: document.date,
    dueDate: document.dueDate,
    status: document.status,
    total: toAmountString(document.amountTotal),
    paid: toAmountString(document.amountPaid),
    outstanding: toAmountString(residual),
    isOverdue:
      document.dueDate !== null && document.dueDate.getTime() < Date.now() && !residual.isZero(),
  };
}

/**
 * A contact's own invoices.
 *
 * Draft and cancelled documents are deliberately excluded: a draft is internal
 * working state, and showing one to a customer would imply a commitment that
 * has not been made.
 */
export async function listPortalInvoices(
  contactId: string,
  client: DbClient = prisma,
): Promise<PortalDocumentRow[]> {
  const invoices = await client.customerInvoice.findMany({
    where: { customerId: contactId, status: { in: VISIBLE_STATUSES } },
    orderBy: [{ invoiceDate: "desc" }, { number: "desc" }],
    select: {
      id: true,
      number: true,
      invoiceDate: true,
      dueDate: true,
      status: true,
      amountTotal: true,
      amountPaid: true,
      amountResidual: true,
    },
  });

  return invoices.map((invoice) => toRow({ ...invoice, date: invoice.invoiceDate }));
}

/** A contact's own bills, when they are also a vendor. */
export async function listPortalBills(
  contactId: string,
  client: DbClient = prisma,
): Promise<PortalDocumentRow[]> {
  const bills = await client.vendorBill.findMany({
    where: { vendorId: contactId, status: { in: VISIBLE_STATUSES } },
    orderBy: [{ invoiceDate: "desc" }, { number: "desc" }],
    select: {
      id: true,
      number: true,
      invoiceDate: true,
      dueDate: true,
      status: true,
      amountTotal: true,
      amountPaid: true,
      amountResidual: true,
    },
  });

  return bills.map((bill) => toRow({ ...bill, date: bill.invoiceDate }));
}

/**
 * One invoice, but only if it belongs to this contact.
 *
 * `customerId` is part of the WHERE clause rather than checked afterwards, so
 * another contact's id simply matches no row.
 */
export async function getPortalInvoice(
  params: { contactId: string; invoiceId: string },
  client: DbClient = prisma,
) {
  return client.customerInvoice.findFirst({
    where: {
      id: params.invoiceId,
      customerId: params.contactId,
      status: { in: VISIBLE_STATUSES },
    },
    select: {
      id: true,
      number: true,
      reference: true,
      invoiceDate: true,
      dueDate: true,
      status: true,
      amountUntaxed: true,
      amountTax: true,
      amountTotal: true,
      amountPaid: true,
      amountResidual: true,
      customer: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPrice: true,
          taxAmount: true,
          total: true,
        },
      },
      allocations: {
        where: { payment: { status: "POSTED" } },
        select: {
          id: true,
          amount: true,
          payment: { select: { number: true, paymentDate: true, method: true } },
        },
      },
    },
  });
}

/** A contact's own payments, both directions. */
export async function listPortalPayments(contactId: string, client: DbClient = prisma) {
  const payments = await client.payment.findMany({
    where: { contactId, status: "POSTED" },
    orderBy: [{ paymentDate: "desc" }, { number: "desc" }],
    select: {
      id: true,
      number: true,
      paymentDate: true,
      direction: true,
      method: true,
      amount: true,
      reference: true,
    },
  });

  return payments.map((payment) => ({
    id: payment.id,
    number: payment.number,
    date: payment.paymentDate,
    direction: payment.direction,
    method: payment.method,
    amount: toAmountString(payment.amount),
    reference: payment.reference,
  }));
}

/** The headline figures for the portal home page. */
export async function getPortalOverview(
  contactId: string,
  client: DbClient = prisma,
): Promise<PortalOverview | null> {
  const contact = await client.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true },
  });

  if (!contact) return null;

  const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));

  const [invoices, bills, receipts] = await Promise.all([
    client.customerInvoice.findMany({
      where: { customerId: contactId, status: { in: OPEN_STATUSES } },
      select: { amountResidual: true, dueDate: true },
    }),
    client.vendorBill.findMany({
      where: { vendorId: contactId, status: { in: OPEN_STATUSES } },
      select: { amountResidual: true },
    }),
    client.payment.findMany({
      where: {
        contactId,
        status: "POSTED",
        direction: PaymentDirection.INBOUND,
        paymentDate: { gte: startOfYear },
      },
      select: { amount: true },
    }),
  ]);

  let outstandingInvoices = ZERO;
  let overdue = 0;
  const now = Date.now();

  for (const invoice of invoices) {
    outstandingInvoices = add(outstandingInvoices, invoice.amountResidual);
    if (invoice.dueDate && invoice.dueDate.getTime() < now) overdue += 1;
  }

  let outstandingBills = ZERO;
  for (const bill of bills) outstandingBills = add(outstandingBills, bill.amountResidual);

  let paidThisYear = ZERO;
  for (const receipt of receipts) paidThisYear = add(paidThisYear, receipt.amount);

  return {
    contactName: contact.name,
    outstandingInvoices: toAmountString(outstandingInvoices),
    outstandingBills: toAmountString(outstandingBills),
    openInvoiceCount: invoices.length,
    overdueInvoiceCount: overdue,
    paidThisYear: toAmountString(paidThisYear),
  };
}
