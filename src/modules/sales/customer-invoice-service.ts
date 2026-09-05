import {
  type CustomerInvoice,
  InvoiceStatus,
  type Prisma,
  SalesOrderStatus,
  StockMoveType,
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
import { type InvoicePostingLine, buildCustomerInvoiceEntry } from "./invoice-posting";
import { assertInvoiceable } from "./sales-order-service";
import { type ConvertToInvoiceInput, type CustomerInvoiceSortField } from "./schemas";

/**
 * Customer invoice service.
 *
 * Where a sale becomes accounting. The invoice is assembled here; the journal
 * entry is built by `buildCustomerInvoiceEntry` and posted by the accounting
 * engine, which enforces the balance rule.
 */

export interface CustomerInvoiceListRow {
  id: string;
  number: string;
  customerName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  amountTotal: string;
  amountResidual: string;
  salesOrderNumber: string | null;
}

function buildWhere(
  params: ListParams<CustomerInvoiceSortField>,
): Prisma.CustomerInvoiceWhereInput {
  const where: Prisma.CustomerInvoiceWhereInput = {};

  if (params.filters.status) where.status = params.filters.status as InvoiceStatus;
  if (params.filters.customer) where.customerId = params.filters.customer;

  if (params.search) {
    where.OR = [
      ...(searchWhere(params.search, ["number", "reference"]).OR ?? []),
      { customer: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function listCustomerInvoices(
  params: ListParams<CustomerInvoiceSortField>,
  client: DbClient = prisma,
): Promise<{ rows: CustomerInvoiceListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.customerInvoice.findMany({
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
        customer: { select: { name: true } },
        salesOrder: { select: { number: true } },
      },
    }),
    client.customerInvoice.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      number: record.number,
      customerName: record.customer.name,
      invoiceDate: record.invoiceDate,
      dueDate: record.dueDate,
      status: record.status,
      amountTotal: toAmountString(record.amountTotal),
      amountResidual: toAmountString(record.amountResidual),
      salesOrderNumber: record.salesOrder?.number ?? null,
    })),
  };
}

export async function getCustomerInvoice(id: string, client: DbClient = prisma) {
  const invoice = await client.customerInvoice.findUnique({
    where: { id },
    include: {
      customer: true,
      journal: { select: { id: true, code: true, name: true } },
      salesOrder: { select: { id: true, number: true } },
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
            select: { id: true, number: true, paymentDate: true, method: true, status: true },
          },
        },
      },
    },
  });

  if (!invoice) throw new NotFoundError("Customer invoice", id);
  return invoice;
}

/**
 * Generates a draft customer invoice from a confirmed sales order.
 *
 * The income account is resolved from the product, falling back to the company
 * default. The invoice starts DRAFT: it only becomes accounting on posting.
 */
export async function createInvoiceFromSalesOrder(
  tx: DbClient,
  input: ConvertToInvoiceInput,
  context: { userId?: string | null } = {},
): Promise<CustomerInvoice> {
  const order = await tx.salesOrder.findUnique({
    where: { id: input.salesOrderId },
    include: { lines: { orderBy: { sequence: "asc" } }, customer: true },
  });

  if (!order) throw new NotFoundError("Sales order", input.salesOrderId);

  // Refuses drafts, cancelled orders, and orders already invoiced.
  assertInvoiceable(order);

  if (order.lines.length === 0) {
    throw new ValidationError("This sales order has no lines to invoice.");
  }

  const journal = await tx.journal.findUnique({
    where: { id: input.journalId },
    select: { id: true, isArchived: true, name: true },
  });
  if (!journal) throw new NotFoundError("Journal", input.journalId);
  if (journal.isArchived) {
    throw new ValidationError(`${journal.name} is archived and cannot be used.`);
  }

  const settings = await tx.companySettings.findUnique({ where: { id: "company" } });
  const products = await tx.product.findMany({
    where: { id: { in: order.lines.map((line) => line.productId).filter(Boolean) as string[] } },
    select: { id: true, incomeAccountId: true },
  });
  const incomeAccountByProduct = new Map(products.map((p) => [p.id, p.incomeAccountId]));

  const fallbackIncomeAccountId = settings?.defaultIncomeAccountId;
  if (!fallbackIncomeAccountId) {
    throw new ValidationError(
      "No default income account is configured. Set one in company settings before invoicing.",
    );
  }

  const number = await nextNumber(tx, SEQUENCE_CODES.CUSTOMER_INVOICE);

  const invoice = await tx.customerInvoice.create({
    data: {
      number,
      customerId: order.customerId,
      salesOrderId: order.id,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      reference: input.reference ?? order.reference,
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
            (line.productId ? incomeAccountByProduct.get(line.productId) : null) ??
            fallbackIncomeAccountId,
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

  for (const line of order.lines) {
    await tx.salesOrderLine.update({
      where: { id: line.id },
      data: { quantityInvoiced: line.quantity },
    });
  }

  await tx.salesOrder.update({
    where: { id: order.id },
    data: { status: SalesOrderStatus.INVOICED },
  });

  await recordAudit(
    tx,
    {
      action: "convert",
      entity: "CustomerInvoice",
      entityId: invoice.id,
      summary: `Created invoice ${invoice.number} from sales order ${order.number}`,
      metadata: { salesOrderId: order.id },
    },
    context,
  );

  return invoice;
}

/**
 * Posts a draft invoice to the ledger and ships the stock.
 *
 * All of it runs in the caller's transaction: if the entry does not balance, or
 * any later step fails, the invoice stays a draft and no stock moves.
 */
export async function postCustomerInvoice(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<CustomerInvoice> {
  const invoice = await tx.customerInvoice.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, receivableAccountId: true } },
      lines: {
        orderBy: { sequence: "asc" },
        include: { tax: { select: { id: true, collectedAccountId: true } } },
      },
    },
  });

  if (!invoice) throw new NotFoundError("Customer invoice", id);

  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new InvalidStateTransitionError("customer invoice", invoice.status, InvoiceStatus.POSTED);
  }

  if (invoice.lines.length === 0) {
    throw new ValidationError("This invoice has no lines and cannot be posted.");
  }

  const settings = await tx.companySettings.findUnique({ where: { id: "company" } });

  const receivableAccountId =
    invoice.customer.receivableAccountId ?? settings?.defaultReceivableAccountId;

  if (!receivableAccountId) {
    throw new ValidationError(
      `No receivable account is set for ${invoice.customer.name}, and no company default is configured.`,
    );
  }

  const fallbackTaxAccountId = settings?.defaultTaxPayableAccountId ?? null;

  const postingLines: InvoicePostingLine[] = invoice.lines.map((line) => ({
    accountId: line.accountId,
    subtotal: toMoney(line.subtotal),
    taxAmount: toMoney(line.taxAmount),
    taxAccountId: line.tax?.collectedAccountId ?? fallbackTaxAccountId,
    analyticAccountId: line.analyticAccountId,
    description: line.description,
  }));

  const hasUnroutedTax = postingLines.some(
    (line) => !line.taxAmount.isZero() && !line.taxAccountId,
  );
  if (hasUnroutedTax) {
    throw new ValidationError(
      "This invoice has tax but no tax-payable account is configured. Set one on the tax or in company settings.",
    );
  }

  const draft = buildCustomerInvoiceEntry({
    journalId: invoice.journalId,
    invoiceDate: invoice.invoiceDate,
    invoiceNumber: invoice.number,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    reference: invoice.reference,
    receivableAccountId,
    lines: postingLines,
  });

  const entry = await postJournalEntry(tx, draft, { userId: context.userId });

  const updated = await tx.customerInvoice.update({
    where: { id },
    data: {
      status: InvoiceStatus.POSTED,
      journalEntryId: entry.id,
      amountResidual: invoice.amountTotal,
    },
  });

  await createStockMovesForInvoice(tx, invoice.id, context);

  await recordAudit(
    tx,
    {
      action: "post",
      entity: "CustomerInvoice",
      entityId: id,
      summary: `Posted invoice ${invoice.number} (entry ${entry.number})`,
      metadata: { journalEntryId: entry.id },
    },
    context,
  );

  return updated;
}

/**
 * Ships stock for inventory-tracked products.
 *
 * v1 is periodic inventory: moves drive the stock report and on-hand quantity
 * but do not post to the ledger themselves.
 */
async function createStockMovesForInvoice(
  tx: DbClient,
  invoiceId: string,
  context: { userId?: string | null },
): Promise<void> {
  const lines = await tx.customerInvoiceLine.findMany({
    where: { invoiceId, product: { trackInventory: true } },
    include: { invoice: { select: { number: true, invoiceDate: true } } },
  });

  for (const line of lines) {
    if (!line.productId) continue;

    await tx.stockMove.create({
      data: {
        productId: line.productId,
        moveType: StockMoveType.SALE_DELIVERY,
        direction: "OUT",
        date: line.invoice.invoiceDate,
        quantity: line.quantity,
        unitCost: line.unitPrice,
        value: line.subtotal,
        reference: line.invoice.number,
        sourceType: "CustomerInvoice",
        sourceId: invoiceId,
        createdById: context.userId ?? null,
      },
    });
  }
}

/** Cancels a draft invoice and reopens its sales order for invoicing. */
export async function cancelCustomerInvoice(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<CustomerInvoice> {
  const invoice = await tx.customerInvoice.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, salesOrderId: true },
  });
  if (!invoice) throw new NotFoundError("Customer invoice", id);

  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new ConflictError(
      `Invoice ${invoice.number} is ${invoice.status.toLowerCase().replace("_", " ")} and cannot be cancelled. Post a reversing entry instead.`,
    );
  }

  const updated = await tx.customerInvoice.update({
    where: { id },
    data: { status: InvoiceStatus.CANCELLED },
  });

  if (invoice.salesOrderId) {
    await tx.salesOrder.update({
      where: { id: invoice.salesOrderId },
      data: { status: SalesOrderStatus.CONFIRMED },
    });
  }

  await recordAudit(
    tx,
    {
      action: "cancel",
      entity: "CustomerInvoice",
      entityId: id,
      summary: `Cancelled invoice ${invoice.number}`,
    },
    context,
  );

  return updated;
}
