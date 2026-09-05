import { ContactType, type Prisma, type PurchaseOrder, PurchaseOrderStatus } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
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
import { computeDocumentTotals, computeLineAmounts } from "./pricing";
import { type PurchaseOrderInput, type PurchaseOrderSortField } from "./schemas";

/**
 * Purchase order service.
 *
 * A purchase order is a commitment, not an accounting event: it never touches
 * the ledger. It becomes accounting when it is converted into a vendor bill.
 *
 * State machine: DRAFT -> CONFIRMED -> BILLED, or CANCELLED from DRAFT/CONFIRMED.
 * Only DRAFT orders are editable.
 */

export interface PurchaseOrderListRow {
  id: string;
  number: string;
  vendorName: string;
  orderDate: Date;
  status: PurchaseOrderStatus;
  amountTotal: string;
  lineCount: number;
  billCount: number;
}

function buildWhere(params: ListParams<PurchaseOrderSortField>): Prisma.PurchaseOrderWhereInput {
  const where: Prisma.PurchaseOrderWhereInput = {};

  if (params.filters.status) where.status = params.filters.status as PurchaseOrderStatus;
  if (params.filters.vendor) where.vendorId = params.filters.vendor;

  if (params.search) {
    where.OR = [
      ...(searchWhere(params.search, ["number", "reference"]).OR ?? []),
      { vendor: { name: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  return where;
}

export async function listPurchaseOrders(
  params: ListParams<PurchaseOrderSortField>,
  client: DbClient = prisma,
): Promise<{ rows: PurchaseOrderListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.purchaseOrder.findMany({
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
        vendor: { select: { name: true } },
        _count: { select: { lines: true, bills: true } },
      },
    }),
    client.purchaseOrder.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      number: record.number,
      vendorName: record.vendor.name,
      orderDate: record.orderDate,
      status: record.status,
      amountTotal: toAmountString(record.amountTotal),
      lineCount: record._count.lines,
      billCount: record._count.bills,
    })),
  };
}

export async function getPurchaseOrder(id: string, client: DbClient = prisma) {
  const order = await client.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      lines: {
        orderBy: { sequence: "asc" },
        include: {
          product: { select: { id: true, name: true } },
          tax: { select: { id: true, name: true, rate: true, computation: true } },
          analyticAccount: { select: { id: true, code: true, name: true } },
        },
      },
      bills: { select: { id: true, number: true, status: true } },
    },
  });

  if (!order) throw new NotFoundError("Purchase order", id);
  return order;
}

/**
 * The vendor must exist, be usable as a vendor, and not be archived.
 * Rejecting here keeps a customer-only contact off purchase documents.
 */
async function assertValidVendor(client: DbClient, vendorId: string): Promise<void> {
  const vendor = await client.contact.findUnique({
    where: { id: vendorId },
    select: { id: true, name: true, type: true, isArchived: true },
  });

  if (!vendor) {
    throw new ValidationError("Select a valid vendor.", {
      fieldErrors: { vendorId: "This vendor does not exist." },
    });
  }

  if (vendor.isArchived) {
    throw new ValidationError(`${vendor.name} is archived and cannot be used on new documents.`, {
      fieldErrors: { vendorId: "This vendor is archived." },
    });
  }

  if (vendor.type === ContactType.CUSTOMER) {
    throw new ValidationError(`${vendor.name} is a customer, not a vendor.`, {
      fieldErrors: { vendorId: "This contact is not a vendor." },
    });
  }
}

/** Every product on the order must exist and still be active. */
async function assertValidProducts(client: DbClient, input: PurchaseOrderInput): Promise<void> {
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
      throw new ValidationError(`${product.name} is archived and cannot be ordered.`);
    }
  }
}

/** Loads the tax rules referenced by the lines, so amounts can be computed. */
async function loadTaxRules(client: DbClient, input: PurchaseOrderInput) {
  const taxIds = [...new Set(input.lines.map((line) => line.taxId).filter(Boolean))] as string[];
  if (taxIds.length === 0)
    return new Map<string, { computation: "PERCENTAGE" | "FIXED"; rate: string }>();

  const taxes = await client.tax.findMany({
    where: { id: { in: taxIds } },
    select: { id: true, computation: true, rate: true },
  });

  return new Map(
    taxes.map((tax) => [tax.id, { computation: tax.computation, rate: tax.rate.toString() }]),
  );
}

function buildLineData(
  input: PurchaseOrderInput,
  taxRules: Map<string, { computation: "PERCENTAGE" | "FIXED"; rate: string }>,
) {
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

export async function createPurchaseOrder(
  tx: DbClient,
  input: PurchaseOrderInput,
  context: { userId?: string | null } = {},
): Promise<PurchaseOrder> {
  await assertValidVendor(tx, input.vendorId);
  await assertValidProducts(tx, input);

  const taxRules = await loadTaxRules(tx, input);
  const lines = buildLineData(input, taxRules);
  const totals = computeDocumentTotals(lines.map((line) => line.amounts));

  const number = await nextNumber(tx, SEQUENCE_CODES.PURCHASE_ORDER);

  const order = await tx.purchaseOrder.create({
    data: {
      number,
      vendorId: input.vendorId,
      orderDate: input.orderDate,
      expectedDate: input.expectedDate,
      reference: input.reference,
      notes: input.notes,
      status: PurchaseOrderStatus.DRAFT,
      amountUntaxed: totals.amountUntaxed,
      amountTax: totals.amountTax,
      amountTotal: totals.amountTotal,
      createdById: context.userId ?? null,
      lines: {
        create: lines.map(({ amounts: _amounts, ...line }) => line),
      },
    },
  });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "PurchaseOrder",
      entityId: order.id,
      summary: `Created purchase order ${order.number}`,
    },
    context,
  );

  return order;
}

export async function updatePurchaseOrder(
  tx: DbClient,
  id: string,
  input: PurchaseOrderInput,
  context: { userId?: string | null } = {},
): Promise<PurchaseOrder> {
  const existing = await tx.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true },
  });
  if (!existing) throw new NotFoundError("Purchase order", id);

  if (existing.status !== PurchaseOrderStatus.DRAFT) {
    throw new InvalidStateTransitionError("purchase order", existing.status, "edited");
  }

  await assertValidVendor(tx, input.vendorId);
  await assertValidProducts(tx, input);

  const taxRules = await loadTaxRules(tx, input);
  const lines = buildLineData(input, taxRules);
  const totals = computeDocumentTotals(lines.map((line) => line.amounts));

  // Draft lines are replaced wholesale; nothing downstream references them yet.
  await tx.purchaseOrderLine.deleteMany({ where: { orderId: id } });

  const order = await tx.purchaseOrder.update({
    where: { id },
    data: {
      vendorId: input.vendorId,
      orderDate: input.orderDate,
      expectedDate: input.expectedDate,
      reference: input.reference,
      notes: input.notes,
      amountUntaxed: totals.amountUntaxed,
      amountTax: totals.amountTax,
      amountTotal: totals.amountTotal,
      lines: {
        create: lines.map(({ amounts: _amounts, ...line }) => line),
      },
    },
  });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "PurchaseOrder",
      entityId: id,
      summary: `Updated purchase order ${order.number}`,
    },
    context,
  );

  return order;
}

/** DRAFT -> CONFIRMED. A confirmed order can be billed. */
export async function confirmPurchaseOrder(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<PurchaseOrder> {
  const existing = await tx.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, _count: { select: { lines: true } } },
  });
  if (!existing) throw new NotFoundError("Purchase order", id);

  if (existing.status !== PurchaseOrderStatus.DRAFT) {
    throw new InvalidStateTransitionError(
      "purchase order",
      existing.status,
      PurchaseOrderStatus.CONFIRMED,
    );
  }

  if (existing._count.lines === 0) {
    throw new ValidationError("Add at least one line before confirming this purchase order.");
  }

  const order = await tx.purchaseOrder.update({
    where: { id },
    data: { status: PurchaseOrderStatus.CONFIRMED },
  });

  await recordAudit(
    tx,
    {
      action: "confirm",
      entity: "PurchaseOrder",
      entityId: id,
      summary: `Confirmed purchase order ${order.number}`,
    },
    context,
  );

  return order;
}

/** Cancels a draft or confirmed order. An order that has been billed cannot be cancelled. */
export async function cancelPurchaseOrder(
  tx: DbClient,
  id: string,
  context: { userId?: string | null } = {},
): Promise<PurchaseOrder> {
  const existing = await tx.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, number: true, status: true, _count: { select: { bills: true } } },
  });
  if (!existing) throw new NotFoundError("Purchase order", id);

  // Already cancelled: nothing to do, but return the full record.
  if (existing.status === PurchaseOrderStatus.CANCELLED) {
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
  }

  if (existing._count.bills > 0) {
    throw new ConflictError(
      `Purchase order ${existing.number} has already been billed and cannot be cancelled. Cancel or reverse the bill instead.`,
    );
  }

  const order = await tx.purchaseOrder.update({
    where: { id },
    data: { status: PurchaseOrderStatus.CANCELLED },
  });

  await recordAudit(
    tx,
    {
      action: "cancel",
      entity: "PurchaseOrder",
      entityId: id,
      summary: `Cancelled purchase order ${order.number}`,
    },
    context,
  );

  return order;
}

/**
 * Guard used before conversion: only a CONFIRMED order may become a bill.
 * A draft has not been agreed, and a cancelled or already-billed order must
 * never produce a second bill.
 */
export function assertBillable(order: { number: string; status: PurchaseOrderStatus }): void {
  if (order.status === PurchaseOrderStatus.CONFIRMED) return;

  if (order.status === PurchaseOrderStatus.DRAFT) {
    throw new ConflictError(
      `Purchase order ${order.number} is still a draft. Confirm it before creating a vendor bill.`,
    );
  }

  if (order.status === PurchaseOrderStatus.BILLED) {
    throw new ConflictError(`Purchase order ${order.number} has already been billed.`);
  }

  throw new ConflictError(
    `Purchase order ${order.number} is ${order.status.toLowerCase()} and cannot be billed.`,
  );
}
