import { ContactType, type Prisma, type SalesOrder, SalesOrderStatus } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { computeDocumentTotals, computeLineAmounts } from "@/modules/purchases/pricing";
import { searchWhere } from "@/modules/shared/list-filters";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import {
  ConflictError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import { toAmountString } from "@/server/money";
import { SEQUENCE_CODES, nextNumber } from "@/server/sequence/sequence-service";
import { type SalesOrderInput, type SalesOrderSortField } from "./schemas";

/**
 * Sales order service.
 *
 * A sales order is a commitment, not an accounting event: it never touches the
 * ledger. It becomes accounting when it is turned into a customer invoice.
 *
 * State machine: DRAFT -> CONFIRMED -> INVOICED, or CANCELLED from
 * DRAFT/CONFIRMED. Only DRAFT orders are editable.
 */

export interface SalesOrderListRow {
  id: string;
  number: string;
  customerName: string;
  orderDate: Date;
  status: SalesOrderStatus;
  amountTotal: string;
  lineCount: number;
  invoiceCount: number;
}

function buildWhere(params: ListParams<SalesOrderSortField>): Prisma.SalesOrderWhereInput {
  const where: Prisma.SalesOrderWhereInput = {};

  if (params.filters.status) where.status = params.filters.status as SalesOrderStatus;
  if (params.filters.customer) where.customerId = params.filters.customer;

  if (params.search) {
    where.OR = [
      ...(searchWhere(params.search, ["number", "reference"]).OR ?? []),
      { customer: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function listSalesOrders(
  params: ListParams<SalesOrderSortField>,
  client: DbClient = prisma,
): Promise<{ rows: SalesOrderListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.salesOrder.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        number: true,
        orderDate: true,
        status: true,
        amountTotal: true,
        customer: { select: { name: true } },
        _count: { select: { lines: true, invoices: true } },
      },
    }),
    client.salesOrder.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      number: record.number,
      customerName: record.customer.name,
      orderDate: record.orderDate,
      status: record.status,
      amountTotal: toAmountString(record.amountTotal),
      lineCount: record._count.lines,
      invoiceCount: record._count.invoices,
    })),
  };
}

export async function getSalesOrder(id: string, client: DbClient = prisma) {
  const order = await client.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: {
        orderBy: { sequence: "asc" },
        include: {
          product: { select: { id: true, name: true } },
          tax: { select: { id: true, name: true, rate: true, computation: true } },
          analyticAccount: { select: { id: true, code: true, name: true } },
        },
      },
      invoices: { select: { id: true, number: true, status: true } },
    },
  });

  if (!order) throw new NotFoundError("Sales order", id);
  return order;
}

/**
 * The customer must exist, be usable as a customer, and not be archived.
 * A vendor-only contact can never appear on a sales document.
 */
async function assertValidCustomer(client: DbClient, customerId: string): Promise<void> {
  const customer = await client.contact.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, type: true, isArchived: true },
  });

  if (!customer) {
    throw new ValidationError("Select a valid customer.", {
      fieldErrors: { customerId: "This customer does not exist." },
    });
  }

  if (customer.isArchived) {
    throw new ValidationError(`${customer.name} is archived and cannot be used on new documents.`, {
      fieldErrors: { customerId: "This customer is archived." },
    });
  }

  if (customer.type === ContactType.VENDOR) {
    throw new ValidationError(`${customer.name} is a vendor, not a customer.`, {
      fieldErrors: { customerId: "This contact is not a customer." },
    });
  }
}

async function assertValidProducts(client: DbClient, input: SalesOrderInput): Promise<void> {
  const productIds = [...new Set(input.lines.map((line) => line.productId).filter(Boolean))];
  if (productIds.length === 0) return;

  const products = await client.product.findMany({
    where: { id: { in: productIds as string[] } },
    select: { id: true, name: true, isArchived: true },
  });

  const byId = new Map(products.map((product) => [product.id, product]));

  for (const productId of productIds as string[]) {
    const product = byId.get(productId);
    if (!product) throw new ValidationError(`Product '${productId}' does not exist.`);
    if (product.isArchived) {
      throw new ValidationError(`${product.name} is archived and cannot be sold.`);
    }
  }
}

type TaxRuleMap = Map<string, { computation: "PERCENTAGE" | "FIXED"; rate: string }>;

async function loadTaxRules(client: DbClient, input: SalesOrderInput): Promise<TaxRuleMap> {
  const taxIds = [...new Set(input.lines.map((line) => line.taxId).filter(Boolean))] as string[];
  if (taxIds.length === 0) return new Map();

  const taxes = await client.tax.findMany({
    where: { id: { in: taxIds } },
    select: { id: true, computation: true, rate: true },
  });

  return new Map(
    taxes.map((tax) => [tax.id, { computation: tax.computation, rate: tax.rate.toString() }]),
  );
}

function buildLineData(input: SalesOrderInput, taxRules: TaxRuleMap) {
  return input.lines.map((line, index) => {
    const rule = line.taxId ? taxRules.get(line.taxId) : null;
    const amounts = computeLineAmounts(line.quantity, line.unitPrice, rule ?? null);

    return {
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxId: line.taxId,
      analyticAccountId: line.analyticAccountId,
      subtotal: amounts.subtotal,
      taxAmount: amounts.taxAmount,
      total: amounts.total,
      sequence: index,
      amounts,
    };
  });
}

export async function createSalesOrder(
  tx: DbClient,
  input: SalesOrderInput,
  context: { userId?: string | null } = {},
): Promise<SalesOrder> {
  await assertValidCustomer(tx, input.customerId);
  await assertValidProducts(tx, input);

  const taxRules = await loadTaxRules(tx, input);
  const lines = buildLineData(input, taxRules);
  const totals = computeDocumentTotals(lines.map((line) => line.amounts));

  const number = await nextNumber(tx, SEQUENCE_CODES.SALES_ORDER);

  const order = await tx.salesOrder.create({
    data: {
      number,
      customerId: input.customerId,
      orderDate: input.orderDate,
      reference: input.reference,
      notes: input.notes,
      status: SalesOrderStatus.DRAFT,
      amountUntaxed: totals.amountUntaxed,
      amountTax: totals.amountTax,
      amountTotal: totals.amountTotal,
      createdById: context.userId ?? null,
      lines: { create: lines.map(({ amounts: _amounts, ...line }) => line) },
    },
  });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "SalesOrder",
      entityId: order.id,
      summary: `Created sales order ${order.number}`,
    },
    context,
  );

  return order;
}

export async function updateSalesOrder(
  tx: DbClient,
  id: string,
  input: SalesOrderInput,
  context: { userId?: string | null } = {},
): Promise<SalesOrder> {
  const existing = await tx.salesOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true },
  });
  if (!existing) throw new NotFoundError("Sales order", id);

  if (existing.status !== SalesOrderStatus.DRAFT) {
    throw new InvalidStateTransitionError("sales order", existing.status, "edited");
  }

  await assertValidCustomer(tx, input.customerId);
  await assertValidProducts(tx, input);

  const taxRules = await loadTaxRules(tx, input);
  const lines = buildLineData(input, taxRules);
  const totals = computeDocumentTotals(lines.map((line) => line.amounts));

  await tx.salesOrderLine.deleteMany({ where: { orderId: id } });

  const order = await tx.salesOrder.update({
    where: { id },
    data: {
      customerId: input.customerId,
      orderDate: input.orderDate,
      reference: input.reference,
      notes: input.notes,
      amountUntaxed: totals.amountUntaxed,
      amountTax: totals.amountTax,
      amountTotal: totals.amountTotal,
      lines: { create: lines.map(({ amounts: _amounts, ...line }) => line) },
    },
  });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "SalesOrder",
      entityId: id,
      summary: `Updated sales order ${order.number}`,
    },
    context,
  );

  return order;
}

/** DRAFT -> CONFIRMED. A confirmed order can be invoiced. */
export async function confirmSalesOrder(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<SalesOrder> {
  const existing = await tx.salesOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, _count: { select: { lines: true } } },
  });
  if (!existing) throw new NotFoundError("Sales order", id);

  if (existing.status !== SalesOrderStatus.DRAFT) {
    throw new InvalidStateTransitionError(
      "sales order",
      existing.status,
      SalesOrderStatus.CONFIRMED,
    );
  }

  if (existing._count.lines === 0) {
    throw new ValidationError("Add at least one line before confirming this sales order.");
  }

  const order = await tx.salesOrder.update({
    where: { id },
    data: { status: SalesOrderStatus.CONFIRMED },
  });

  await recordAudit(
    tx,
    {
      action: "confirm",
      entity: "SalesOrder",
      entityId: id,
      summary: `Confirmed sales order ${order.number}`,
    },
    context,
  );

  return order;
}

export async function cancelSalesOrder(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<SalesOrder> {
  const existing = await tx.salesOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, _count: { select: { invoices: true } } },
  });
  if (!existing) throw new NotFoundError("Sales order", id);

  if (existing.status === SalesOrderStatus.CANCELLED) {
    return tx.salesOrder.findUniqueOrThrow({ where: { id } });
  }

  if (existing._count.invoices > 0) {
    throw new ConflictError(
      `Sales order ${existing.number} has already been invoiced and cannot be cancelled. Cancel or reverse the invoice instead.`,
    );
  }

  const order = await tx.salesOrder.update({
    where: { id },
    data: { status: SalesOrderStatus.CANCELLED },
  });

  await recordAudit(
    tx,
    {
      action: "cancel",
      entity: "SalesOrder",
      entityId: id,
      summary: `Cancelled sales order ${order.number}`,
    },
    context,
  );

  return order;
}

/**
 * Guard before conversion: only a CONFIRMED order may become an invoice.
 *
 * This is what prevents a duplicate invoice -- once an order is INVOICED it can
 * never produce a second one.
 */
export function assertInvoiceable(order: { number: string; status: SalesOrderStatus }): void {
  if (order.status === SalesOrderStatus.CONFIRMED) return;

  if (order.status === SalesOrderStatus.DRAFT) {
    throw new ConflictError(
      `Sales order ${order.number} is still a draft. Confirm it before generating a customer invoice.`,
    );
  }

  if (order.status === SalesOrderStatus.INVOICED) {
    throw new ConflictError(`Sales order ${order.number} has already been invoiced.`);
  }

  throw new ConflictError(
    `Sales order ${order.number} is ${order.status.toLowerCase()} and cannot be invoiced.`,
  );
}
