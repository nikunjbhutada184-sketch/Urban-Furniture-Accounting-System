import { type StockMove, StockMoveType } from "@prisma/client";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ValidationError } from "@/server/errors";
import {
  type Decimal,
  ZERO,
  add,
  isNegative,
  lineAmount,
  subtract,
  toAmountString,
  toMoney,
  toQuantity,
} from "@/server/money";
import { type StockAdjustmentInput } from "./schemas";

/**
 * Inventory service.
 *
 * v1 is periodic inventory: stock moves record what physically happened and
 * drive the stock report, but do not themselves post to the ledger. Purchases
 * move stock IN when a vendor bill is posted; sales move it OUT when a customer
 * invoice is posted; adjustments are manual corrections.
 *
 * Quantities and values are Decimal throughout -- never JavaScript numbers.
 */

export interface StockBalance {
  productId: string;
  quantityOnHand: Decimal;
  valueOnHand: Decimal;
}

/** Current quantity and value on hand, aggregated from the move history. */
export async function getCurrentStock(
  productId: string,
  client: DbClient = prisma,
): Promise<StockBalance> {
  const moves = await client.stockMove.findMany({
    where: { productId },
    select: { direction: true, quantity: true, value: true },
  });

  let quantityOnHand = ZERO;
  let valueOnHand = ZERO;

  for (const move of moves) {
    if (move.direction === "IN") {
      quantityOnHand = add(quantityOnHand, move.quantity);
      valueOnHand = add(valueOnHand, move.value);
    } else {
      quantityOnHand = subtract(quantityOnHand, move.quantity);
      valueOnHand = subtract(valueOnHand, move.value);
    }
  }

  return { productId, quantityOnHand, valueOnHand };
}

/**
 * Manual stock correction.
 *
 * A positive quantity adds stock, a negative one removes it. Removing more than
 * is on hand is refused: negative stock is not a state this business can be in.
 */
export async function adjustStock(
  tx: DbClient,
  input: StockAdjustmentInput,
  context: { userId?: string | null } = {},
): Promise<StockMove> {
  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: { id: true, name: true, isArchived: true, trackInventory: true },
  });

  if (!product) {
    throw new ValidationError("Select a valid product.", {
      fieldErrors: { productId: "This product does not exist." },
    });
  }
  if (product.isArchived) {
    throw new ValidationError(`${product.name} is archived and cannot be adjusted.`, {
      fieldErrors: { productId: "This product is archived." },
    });
  }
  if (!product.trackInventory) {
    throw new ValidationError(
      `${product.name} is not inventory-tracked. Enable stock tracking on the product first.`,
      { fieldErrors: { productId: "This product does not track inventory." } },
    );
  }

  const signedQuantity = toQuantity(input.quantity);

  if (signedQuantity.isZero()) {
    throw new ValidationError("An adjustment must change the quantity.", {
      fieldErrors: { quantity: "Enter a non-zero quantity." },
    });
  }

  const direction = signedQuantity.isPositive() ? "IN" : "OUT";
  const quantity = signedQuantity.absoluteValue();
  const unitCost = toMoney(input.unitCost);
  const value = lineAmount(quantity, unitCost);

  // Never let stock go negative.
  if (direction === "OUT") {
    const current = await getCurrentStock(input.productId, tx);
    const resulting = subtract(current.quantityOnHand, quantity);

    if (isNegative(resulting)) {
      throw new ValidationError(
        `Only ${toAmountString(current.quantityOnHand)} of ${product.name} is on hand, so ${toAmountString(quantity)} cannot be removed.`,
        { fieldErrors: { quantity: "Not enough stock on hand." } },
      );
    }
  }

  const move = await tx.stockMove.create({
    data: {
      productId: input.productId,
      moveType: StockMoveType.ADJUSTMENT,
      direction,
      date: new Date(),
      quantity,
      unitCost,
      value,
      reference: input.reference ?? "Manual adjustment",
      sourceType: "StockAdjustment",
      createdById: context.userId ?? null,
    },
  });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "StockMove",
      entityId: move.id,
      summary: `Adjusted ${product.name} by ${toAmountString(signedQuantity)}`,
      metadata: { productId: product.id, direction },
    },
    context,
  );

  return move;
}

export interface StockListRow {
  productId: string;
  name: string;
  sku: string | null;
  quantityOnHand: string;
  valueOnHand: string;
  moveCount: number;
}

/**
 * On-hand stock for every tracked product.
 *
 * Aggregated in the database rather than by loading every move into memory.
 */
export async function listStock(client: DbClient = prisma): Promise<StockListRow[]> {
  const products = await client.product.findMany({
    where: { trackInventory: true, isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true },
  });

  if (products.length === 0) return [];

  const grouped = await client.stockMove.groupBy({
    by: ["productId", "direction"],
    where: { productId: { in: products.map((product) => product.id) } },
    _sum: { quantity: true, value: true },
    _count: { _all: true },
  });

  const totals = new Map<string, { quantity: Decimal; value: Decimal; moves: number }>();

  for (const row of grouped) {
    const current = totals.get(row.productId) ?? { quantity: ZERO, value: ZERO, moves: 0 };
    const quantity = toQuantity(row._sum.quantity ?? 0);
    const value = toMoney(row._sum.value ?? 0);

    totals.set(row.productId, {
      quantity:
        row.direction === "IN"
          ? add(current.quantity, quantity)
          : subtract(current.quantity, quantity),
      value:
        row.direction === "IN" ? add(current.value, value) : subtract(current.value, value),
      moves: current.moves + row._count._all,
    });
  }

  return products.map((product) => {
    const total = totals.get(product.id);
    return {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      quantityOnHand: toAmountString(total?.quantity ?? 0),
      valueOnHand: toAmountString(total?.value ?? 0),
      moveCount: total?.moves ?? 0,
    };
  });
}

/** Products that can be stock-adjusted, with their cost and current quantity. */
export async function listAdjustableProducts(
  client: DbClient = prisma,
): Promise<{ id: string; name: string; cost: string; quantityOnHand: string }[]> {
  const [products, stock] = await Promise.all([
    client.product.findMany({
      where: { trackInventory: true, isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, cost: true },
    }),
    listStock(client),
  ]);

  const onHandById = new Map(stock.map((row) => [row.productId, row.quantityOnHand]));

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    cost: toAmountString(product.cost),
    quantityOnHand: onHandById.get(product.id) ?? "0.00",
  }));
}

/** Every movement for one product, newest first. */
export async function getStockMoves(productId: string, client: DbClient = prisma) {
  return client.stockMove.findMany({
    where: { productId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      date: true,
      moveType: true,
      direction: true,
      quantity: true,
      unitCost: true,
      value: true,
      reference: true,
      sourceType: true,
      sourceId: true,
    },
  });
}
