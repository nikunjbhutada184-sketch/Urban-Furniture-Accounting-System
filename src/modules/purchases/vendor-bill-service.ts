import {
  InvoiceStatus,
  type Prisma,
  PurchaseOrderStatus,
  StockMoveType,
  type VendorBill,
} from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { searchWhere } from "@/modules/shared/list-filters";
import { postJournalEntry } from "@/server/accounting";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import {
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import { toAmountString, toMoney } from "@/server/money";
import { SEQUENCE_CODES, nextNumber } from "@/server/sequence/sequence-service";
import { type BillPostingLine, buildVendorBillEntry } from "./bill-posting";
import { assertBillable } from "./purchase-order-service";
import { type ConvertToBillInput, type VendorBillSortField } from "./schemas";

/**
 * Vendor bill service.
 *
 * This is where a purchase becomes accounting. The bill itself is built here;
 * the journal entry is built by `buildVendorBillEntry` and posted by the
 * accounting engine. No debit/credit logic is duplicated in this module.
 */

export interface VendorBillListRow {
  id: string;
  number: string;
  vendorName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  amountTotal: string;
  amountResidual: string;
  purchaseOrderNumber: string | null;
}

function buildWhere(params: ListParams<VendorBillSortField>): Prisma.VendorBillWhereInput {
  const where: Prisma.VendorBillWhereInput = {};

  if (params.filters.status) where.status = params.filters.status as InvoiceStatus;
  if (params.filters.vendor) where.vendorId = params.filters.vendor;

  if (params.search) {
    where.OR = [
      ...(searchWhere(params.search, ["number", "vendorReference"]).OR ?? []),
      { vendor: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function listVendorBills(
  params: ListParams<VendorBillSortField>,
  client: DbClient = prisma,
): Promise<{ rows: VendorBillListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.vendorBill.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        number: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        amountTotal: true,
        amountResidual: true,
        vendor: { select: { name: true } },
        purchaseOrder: { select: { number: true } },
      },
    }),
    client.vendorBill.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      number: record.number,
      vendorName: record.vendor.name,
      invoiceDate: record.invoiceDate,
      dueDate: record.dueDate,
      status: record.status,
      amountTotal: toAmountString(record.amountTotal),
      amountResidual: toAmountString(record.amountResidual),
      purchaseOrderNumber: record.purchaseOrder?.number ?? null,
    })),
  };
}

export async function getVendorBill(id: string, client: DbClient = prisma) {
  const bill = await client.vendorBill.findUnique({
    where: { id },
    include: {
      vendor: true,
      journal: { select: { id: true, code: true, name: true } },
      purchaseOrder: { select: { id: true, number: true } },
      journalEntry: {
        select: {
          id: true,
          number: true,
          date: true,
          status: true,
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
      lines: {
        orderBy: { sequence: "asc" },
        include: {
          product: { select: { id: true, name: true } },
          tax: { select: { id: true, name: true } },
          account: { select: { id: true, code: true, name: true } },
        },
      },
      allocations: {
        include: {
          payment: {
            select: {
              id: true,
              number: true,
              paymentDate: true,
              method: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!bill) throw new NotFoundError("Vendor bill", id);
  return bill;
}

/**
 * Converts a confirmed purchase order into a draft vendor bill.
 *
 * Each order line becomes a bill line, resolving the expense account from the
 * product (falling back to the company default). The bill starts as DRAFT: it
 * only becomes accounting when it is posted.
 */
export async function createBillFromPurchaseOrder(
  tx: DbClient,
  input: ConvertToBillInput,
  context: { userId?: string | null } = {},
): Promise<VendorBill> {
  const order = await tx.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { lines: { orderBy: { sequence: "asc" } }, vendor: true },
  });

  if (!order) throw new NotFoundError("Purchase order", input.purchaseOrderId);

  // Refuses drafts, cancelled orders and orders that were already billed.
  assertBillable(order);

  if (order.lines.length === 0) {
    throw new ValidationError("This purchase order has no lines to bill.");
  }

  const journal = await tx.journal.findUnique({
    where: { id: input.journalId },
    select: { id: true, isArchived: true, type: true, name: true },
  });
  if (!journal) throw new NotFoundError("Journal", input.journalId);
  if (journal.isArchived) {
    throw new ValidationError(`${journal.name} is archived and cannot be used.`);
  }

  const settings = await tx.companySettings.findUnique({ where: { id: "company" } });
  const products = await tx.product.findMany({
    where: { id: { in: order.lines.map((line) => line.productId).filter(Boolean) as string[] } },
    select: { id: true, expenseAccountId: true },
  });
  const expenseAccountByProduct = new Map(products.map((p) => [p.id, p.expenseAccountId]));

  const fallbackExpenseAccountId = settings?.defaultExpenseAccountId;
  if (!fallbackExpenseAccountId) {
    throw new ValidationError(
      "No default expense account is configured. Set one in company settings before billing.",
    );
  }

  const number = await nextNumber(tx, SEQUENCE_CODES.VENDOR_BILL);

  const bill = await tx.vendorBill.create({
    data: {
      number,
      vendorId: order.vendorId,
      purchaseOrderId: order.id,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      vendorReference: input.vendorReference,
      status: InvoiceStatus.DRAFT,
      journalId: journal.id,
      amountUntaxed: order.amountUntaxed,
      amountTax: order.amountTax,
      amountTotal: order.amountTotal,
      amountPaid: 0,
      amountResidual: order.amountTotal,
      createdById: context.userId ?? null,
      lines: {
        create: order.lines.map((line, index) => ({
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          accountId:
            (line.productId ? expenseAccountByProduct.get(line.productId) : null) ??
            fallbackExpenseAccountId,
          taxId: line.taxId,
          analyticAccountId: line.analyticAccountId,
          subtotal: line.subtotal,
          taxAmount: line.taxAmount,
          total: line.total,
          sequence: index,
        })),
      },
    },
  });

  // Record how much of the order has now been billed, and close it.
  for (const line of order.lines) {
    await tx.purchaseOrderLine.update({
      where: { id: line.id },
      data: { quantityBilled: line.quantity },
    });
  }

  await tx.purchaseOrder.update({
    where: { id: order.id },
    data: { status: PurchaseOrderStatus.BILLED },
  });

  await recordAudit(
    tx,
    {
      action: "convert",
      entity: "VendorBill",
      entityId: bill.id,
      summary: `Created bill ${bill.number} from purchase order ${order.number}`,
      metadata: { purchaseOrderId: order.id },
    },
    context,
  );

  return bill;
}

/**
 * Posts a draft bill to the ledger.
 *
 * Everything below happens in the caller's transaction: if the journal entry
 * is unbalanced, or any later step fails, the bill stays a draft and no
 * accounting is written.
 */
export async function postVendorBill(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<VendorBill> {
  const bill = await tx.vendorBill.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, payableAccountId: true } },
      lines: {
        orderBy: { sequence: "asc" },
        include: { tax: { select: { id: true, paidAccountId: true } } },
      },
    },
  });

  if (!bill) throw new NotFoundError("Vendor bill", id);

  if (bill.status !== InvoiceStatus.DRAFT) {
    throw new InvalidStateTransitionError("vendor bill", bill.status, InvoiceStatus.POSTED);
  }

  if (bill.lines.length === 0) {
    throw new ValidationError("This bill has no lines and cannot be posted.");
  }

  const settings = await tx.companySettings.findUnique({ where: { id: "company" } });

  const payableAccountId = bill.vendor.payableAccountId ?? settings?.defaultPayableAccountId;
  if (!payableAccountId) {
    throw new ValidationError(
      `No payable account is set for ${bill.vendor.name}, and no company default is configured.`,
    );
  }

  const fallbackTaxAccountId = settings?.defaultTaxInputAccountId ?? null;

  const postingLines: BillPostingLine[] = bill.lines.map((line) => ({
    accountId: line.accountId,
    subtotal: toMoney(line.subtotal),
    taxAmount: toMoney(line.taxAmount),
    taxAccountId: line.tax?.paidAccountId ?? fallbackTaxAccountId,
    analyticAccountId: line.analyticAccountId,
    description: line.description,
  }));

  const hasUnroutedTax = postingLines.some(
    (line) => !line.taxAmount.isZero() && !line.taxAccountId,
  );
  if (hasUnroutedTax) {
    throw new ValidationError(
      "This bill has tax but no input-tax account is configured. Set one on the tax or in company settings.",
    );
  }

  // Build the draft, then hand it to the accounting engine, which enforces
  // debits === credits before anything reaches the ledger.
  const draft = buildVendorBillEntry({
    journalId: bill.journalId,
    invoiceDate: bill.invoiceDate,
    billNumber: bill.number,
    billId: bill.id,
    vendorId: bill.vendorId,
    vendorReference: bill.vendorReference,
    payableAccountId,
    lines: postingLines,
  });

  const entry = await postJournalEntry(tx, draft, { userId: context.userId });

  const updated = await tx.vendorBill.update({
    where: { id },
    data: {
      status: InvoiceStatus.POSTED,
      journalEntryId: entry.id,
      amountResidual: bill.amountTotal,
    },
  });

  await createStockMovesForBill(tx, bill.id, context);

  await recordAudit(
    tx,
    {
      action: "post",
      entity: "VendorBill",
      entityId: id,
      summary: `Posted bill ${bill.number} (entry ${entry.number})`,
      metadata: { journalEntryId: entry.id },
    },
    context,
  );

  return updated;
}

/**
 * Records goods received for inventory-tracked products.
 *
 * v1 uses periodic inventory: moves feed the stock report and on-hand quantity
 * but do not post to the ledger themselves.
 */
async function createStockMovesForBill(
  tx: DbClient,
  billId: string,
  context: { userId?: string | null },
): Promise<void> {
  const lines = await tx.vendorBillLine.findMany({
    where: { billId, product: { trackInventory: true } },
    include: {
      product: { select: { id: true } },
      bill: { select: { number: true, invoiceDate: true } },
    },
  });

  for (const line of lines) {
    if (!line.productId) continue;

    await tx.stockMove.create({
      data: {
        productId: line.productId,
        moveType: StockMoveType.PURCHASE_RECEIPT,
        direction: "IN",
        date: line.bill.invoiceDate,
        quantity: line.quantity,
        unitCost: line.unitPrice,
        value: line.subtotal,
        reference: line.bill.number,
        sourceType: "VendorBill",
        sourceId: billId,
        createdById: context.userId ?? null,
      },
    });
  }
}

/** Cancels a draft bill and reopens its purchase order for billing. */
export async function cancelVendorBill(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<VendorBill> {
  const bill = await tx.vendorBill.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, purchaseOrderId: true },
  });
  if (!bill) throw new NotFoundError("Vendor bill", id);

  if (bill.status !== InvoiceStatus.DRAFT) {
    throw new ConflictError(
      `Bill ${bill.number} is ${bill.status.toLowerCase().replace("_", " ")} and cannot be cancelled. Post a reversing entry instead.`,
    );
  }

  const updated = await tx.vendorBill.update({
    where: { id },
    data: { status: InvoiceStatus.CANCELLED },
  });

  if (bill.purchaseOrderId) {
    await tx.purchaseOrder.update({
      where: { id: bill.purchaseOrderId },
      data: { status: PurchaseOrderStatus.CONFIRMED },
    });
  }

  await recordAudit(
    tx,
    {
      action: "cancel",
      entity: "VendorBill",
      entityId: id,
      summary: `Cancelled bill ${bill.number}`,
    },
    context,
  );

  return updated;
}
