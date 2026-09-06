import {
  type PaymentDirection,
  type PaymentMethod,
  type PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { type DbClient, prisma } from "@/server/db/prisma";
import { NotFoundError } from "@/server/errors";
import { toAmountString } from "@/server/money";

/**
 * Payment read models for the accounting screens.
 *
 * Payments are created by the sales and purchase flows; this module lists and
 * shows them, including what each one settled.
 */

export const PAYMENT_SORT_FIELDS = ["paymentDate", "number", "amount"] as const;
export type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

export const PAYMENT_DIRECTION_OPTIONS = [
  { value: "INBOUND", label: "Received" },
  { value: "OUTBOUND", label: "Paid" },
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank" },
] as const;

export interface PaymentListRow {
  id: string;
  number: string;
  paymentDate: Date;
  direction: PaymentDirection;
  method: PaymentMethod;
  status: PaymentStatus;
  contactName: string;
  journalCode: string;
  amount: string;
  reference: string | null;
  allocationCount: number;
  entryId: string | null;
  entryNumber: string | null;
}

export async function listPayments(
  params: ListParams<PaymentSortField>,
  client: DbClient = prisma,
): Promise<{ rows: PaymentListRow[]; total: number }> {
  const where: Prisma.PaymentWhereInput = {};

  if (params.filters.direction) {
    where.direction = params.filters.direction as PaymentDirection;
  }
  if (params.filters.method) where.method = params.filters.method as PaymentMethod;

  if (params.search) {
    where.OR = [
      { number: { contains: params.search, mode: "insensitive" } },
      { reference: { contains: params.search, mode: "insensitive" } },
      { contact: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.payment.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        number: true,
        paymentDate: true,
        direction: true,
        method: true,
        status: true,
        amount: true,
        reference: true,
        contact: { select: { name: true } },
        journal: { select: { code: true } },
        journalEntry: { select: { id: true, number: true } },
        _count: { select: { allocations: true } },
      },
    }),
    client.payment.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      number: record.number,
      paymentDate: record.paymentDate,
      direction: record.direction,
      method: record.method,
      status: record.status,
      contactName: record.contact.name,
      journalCode: record.journal.code,
      amount: toAmountString(record.amount),
      reference: record.reference,
      allocationCount: record._count.allocations,
      entryId: record.journalEntry?.id ?? null,
      entryNumber: record.journalEntry?.number ?? null,
    })),
  };
}

export async function getPayment(id: string, client: DbClient = prisma) {
  const payment = await client.payment.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, name: true, type: true } },
      journal: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      journalEntry: {
        select: {
          id: true,
          number: true,
          date: true,
          items: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              debit: true,
              credit: true,
              description: true,
              account: { select: { code: true, name: true } },
            },
          },
        },
      },
      allocations: {
        include: {
          vendorBill: { select: { id: true, number: true, amountTotal: true } },
          customerInvoice: { select: { id: true, number: true, amountTotal: true } },
        },
      },
    },
  });

  if (!payment) throw new NotFoundError("Payment", id);
  return payment;
}
