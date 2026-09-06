import { type ContactType, InvoiceStatus } from "@prisma/client";
import { type AccessScope, scopeToWhere } from "@/server/auth/permissions";
import { type DbClient, prisma } from "@/server/db/prisma";
import { type Decimal, ZERO, add, toAmountString, toMoney } from "@/server/money";
import { type ReportPeriod } from "./report-service";

/**
 * Partner ledger and ageing.
 *
 * Two views of the same debt. The ledger lists a contact's documents and
 * payments in date order with a running balance; the ageing report buckets what
 * is outstanding by how overdue it is. Both are derived from the documents and
 * the posted ledger at query time — nothing is stored.
 *
 * Every query takes an `AccessScope`, so the portal can reuse these services
 * and physically cannot read another contact's rows.
 */

/** Days overdue, in the buckets an accountant expects to see. */
export const AGEING_BUCKETS = [
  { key: "current", label: "Not due", from: Number.NEGATIVE_INFINITY, to: 0 },
  { key: "d1_30", label: "1–30 days", from: 1, to: 30 },
  { key: "d31_60", label: "31–60 days", from: 31, to: 60 },
  { key: "d61_90", label: "61–90 days", from: 61, to: 90 },
  { key: "d90_plus", label: "Over 90 days", from: 91, to: Number.POSITIVE_INFINITY },
] as const;

export type AgeingBucketKey = (typeof AGEING_BUCKETS)[number]["key"];

export interface AgeingRow {
  contactId: string;
  contactName: string;
  buckets: Record<AgeingBucketKey, string>;
  total: string;
  oldestDays: number;
}

export interface AgeingReport {
  rows: AgeingRow[];
  totals: Record<AgeingBucketKey, string>;
  grandTotal: string;
  asAt: Date;
}

const OPEN_STATUSES = [InvoiceStatus.POSTED, InvoiceStatus.PARTIALLY_PAID];

function bucketFor(daysOverdue: number): AgeingBucketKey {
  for (const bucket of AGEING_BUCKETS) {
    if (daysOverdue >= bucket.from && daysOverdue <= bucket.to) return bucket.key;
  }
  return "d90_plus";
}

function emptyBuckets(): Record<AgeingBucketKey, Decimal> {
  return {
    current: ZERO,
    d1_30: ZERO,
    d31_60: ZERO,
    d61_90: ZERO,
    d90_plus: ZERO,
  };
}

function formatBuckets(buckets: Record<AgeingBucketKey, Decimal>): Record<AgeingBucketKey, string> {
  return {
    current: toAmountString(buckets.current),
    d1_30: toAmountString(buckets.d1_30),
    d31_60: toAmountString(buckets.d31_60),
    d61_90: toAmountString(buckets.d61_90),
    d90_plus: toAmountString(buckets.d90_plus),
  };
}

const MS_PER_DAY = 86_400_000;

/** Whole days between two dates, ignoring the time of day. */
function daysBetween(later: Date, earlier: Date): number {
  const a = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const b = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.round((a - b) / MS_PER_DAY);
}

/**
 * Outstanding customer or vendor balances, bucketed by how overdue they are.
 *
 * A document with no due date is treated as due on its own date, which is the
 * conservative reading: it counts as overdue rather than quietly sitting in
 * "not due" forever.
 */
export async function getAgeingReport(
  params: {
    side: "RECEIVABLE" | "PAYABLE";
    asAt?: Date;
    scope?: AccessScope;
  },
  client: DbClient = prisma,
): Promise<AgeingReport> {
  const asAt = params.asAt ?? new Date();
  const isReceivable = params.side === "RECEIVABLE";
  const scope = params.scope ?? { kind: "all" };

  const contactFilter = scopeToWhere(scope, isReceivable ? "customerId" : "vendorId");

  const documents = isReceivable
    ? await client.customerInvoice.findMany({
        where: { status: { in: OPEN_STATUSES }, invoiceDate: { lte: asAt }, ...contactFilter },
        select: {
          customerId: true,
          dueDate: true,
          invoiceDate: true,
          amountResidual: true,
          customer: { select: { name: true } },
        },
      })
    : await client.vendorBill.findMany({
        where: { status: { in: OPEN_STATUSES }, invoiceDate: { lte: asAt }, ...contactFilter },
        select: {
          vendorId: true,
          dueDate: true,
          invoiceDate: true,
          amountResidual: true,
          vendor: { select: { name: true } },
        },
      });

  const byContact = new Map<
    string,
    { name: string; buckets: Record<AgeingBucketKey, Decimal>; total: Decimal; oldest: number }
  >();

  const totals = emptyBuckets();
  let grandTotal = ZERO;

  for (const document of documents) {
    const contactId =
      "customerId" in document ? document.customerId : (document as { vendorId: string }).vendorId;
    const name =
      "customer" in document
        ? document.customer.name
        : (document as { vendor: { name: string } }).vendor.name;

    const residual = toMoney(document.amountResidual);
    if (residual.isZero()) continue;

    const due = document.dueDate ?? document.invoiceDate;
    const daysOverdue = daysBetween(asAt, due);
    const key = bucketFor(daysOverdue);

    const current = byContact.get(contactId) ?? {
      name,
      buckets: emptyBuckets(),
      total: ZERO,
      oldest: 0,
    };

    current.buckets[key] = add(current.buckets[key], residual);
    current.total = add(current.total, residual);
    current.oldest = Math.max(current.oldest, daysOverdue);
    byContact.set(contactId, current);

    totals[key] = add(totals[key], residual);
    grandTotal = add(grandTotal, residual);
  }

  const rows = [...byContact.entries()]
    .map(([contactId, row]) => ({
      contactId,
      contactName: row.name,
      buckets: formatBuckets(row.buckets),
      total: toAmountString(row.total),
      oldestDays: Math.max(row.oldest, 0),
    }))
    // Worst first: the row an accountant needs to act on is at the top.
    .sort((a, b) => Number(b.total) - Number(a.total));

  return { rows, totals: formatBuckets(totals), grandTotal: toAmountString(grandTotal), asAt };
}

export interface PartnerLedgerLine {
  date: Date;
  kind: "invoice" | "bill" | "receipt" | "payment";
  reference: string;
  documentId: string | null;
  /** Increases what the partner owes us (or we owe them). */
  debit: string;
  /** Decreases it. */
  credit: string;
  runningBalance: string;
}

export interface PartnerLedgerReport {
  contactId: string;
  contactName: string;
  contactType: ContactType;
  openingBalance: string;
  lines: PartnerLedgerLine[];
  closingBalance: string;
  side: "RECEIVABLE" | "PAYABLE";
}

/**
 * One partner's statement: their documents and payments in date order, with a
 * running balance carried forward from before the period.
 *
 * `scope` is applied to the contact itself, so a portal user asking for another
 * contact's statement gets nothing rather than someone else's data.
 */
export async function getPartnerLedger(
  params: {
    contactId: string;
    period: ReportPeriod;
    side: "RECEIVABLE" | "PAYABLE";
    scope?: AccessScope;
  },
  client: DbClient = prisma,
): Promise<PartnerLedgerReport | null> {
  const scope = params.scope ?? { kind: "all" };

  // Fail closed: a scoped caller may only ever read their own contact.
  if (scope.kind === "none") return null;
  if (scope.kind === "contact" && scope.contactId !== params.contactId) return null;

  const contact = await client.contact.findUnique({
    where: { id: params.contactId },
    select: { id: true, name: true, type: true },
  });

  if (!contact) return null;

  const isReceivable = params.side === "RECEIVABLE";

  const [documents, payments] = await Promise.all([
    isReceivable
      ? client.customerInvoice.findMany({
          where: { customerId: contact.id, status: { not: InvoiceStatus.DRAFT } },
          select: { id: true, number: true, invoiceDate: true, amountTotal: true, status: true },
        })
      : client.vendorBill.findMany({
          where: { vendorId: contact.id, status: { not: InvoiceStatus.DRAFT } },
          select: { id: true, number: true, invoiceDate: true, amountTotal: true, status: true },
        }),
    client.payment.findMany({
      where: {
        contactId: contact.id,
        status: "POSTED",
        direction: isReceivable ? "INBOUND" : "OUTBOUND",
      },
      select: { id: true, number: true, paymentDate: true, amount: true },
    }),
  ]);

  type Movement = {
    date: Date;
    kind: PartnerLedgerLine["kind"];
    reference: string;
    id: string;
    debit: Decimal;
    credit: Decimal;
  };

  const movements: Movement[] = [
    ...documents
      .filter((document) => document.status !== InvoiceStatus.CANCELLED)
      .map((document) => ({
        date: document.invoiceDate,
        kind: (isReceivable ? "invoice" : "bill") as PartnerLedgerLine["kind"],
        reference: document.number,
        id: document.id,
        debit: toMoney(document.amountTotal),
        credit: ZERO,
      })),
    ...payments.map((payment) => ({
      date: payment.paymentDate,
      kind: (isReceivable ? "receipt" : "payment") as PartnerLedgerLine["kind"],
      reference: payment.number,
      id: payment.id,
      debit: ZERO,
      credit: toMoney(payment.amount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.reference.localeCompare(b.reference));

  let opening = ZERO;
  const lines: PartnerLedgerLine[] = [];
  let running = ZERO;

  for (const movement of movements) {
    // Anything before the period is folded into the opening balance rather
    // than listed, so the statement starts where the period does.
    if (movement.date.getTime() < params.period.from.getTime()) {
      opening = add(opening, movement.debit).minus(movement.credit);
      continue;
    }

    if (movement.date.getTime() > params.period.to.getTime()) continue;

    if (lines.length === 0) running = opening;
    running = add(running, movement.debit).minus(movement.credit);

    lines.push({
      date: movement.date,
      kind: movement.kind,
      reference: movement.reference,
      documentId: movement.id,
      debit: toAmountString(movement.debit),
      credit: toAmountString(movement.credit),
      runningBalance: toAmountString(running),
    });
  }

  return {
    contactId: contact.id,
    contactName: contact.name,
    contactType: contact.type,
    openingBalance: toAmountString(opening),
    lines,
    closingBalance: toAmountString(lines.length === 0 ? opening : running),
    side: params.side,
  };
}
