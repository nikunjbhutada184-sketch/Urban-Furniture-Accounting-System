import { Prisma, StockMoveType, StockMoveDirection } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { type DbClient } from "@/server/db/prisma";

export interface StockBalance {
  productId: string;
  quantityOnHand: Decimal;
  valueOnHand: Decimal;
}

/**
 * Calculates current stock quantity and value for a product by aggregating its stock moves.
 */
export async function getCurrentStock(tx: DbClient, productId: string): Promise<StockBalance> {
  const moves = await tx.stockMove.findMany({
    where: { productId },
    select: { direction: true, quantity: true, value: true },
  });

  let quantityOnHand = new Decimal(0);
  let valueOnHand = new Decimal(0);

  for (const move of moves) {
    if (move.direction === "IN") {
      quantityOnHand = quantityOnHand.plus(move.quantity);
      valueOnHand = valueOnHand.plus(move.value);
    } else if (move.direction === "OUT") {
      quantityOnHand = quantityOnHand.minus(move.quantity);
      valueOnHand = valueOnHand.minus(move.value);
    }
  }

  return { productId, quantityOnHand, valueOnHand };
}

/**
 * Creates an adjustment move to correct the stock level.
 * @param quantity The amount to add (positive) or subtract (negative).
 * @param unitCost The cost per unit of the adjusted quantity.
 */
export async function adjustStock(
  tx: DbClient,
  params: {
    productId: string;
    quantity: number | string | Decimal;
    unitCost: number | string | Decimal;
    reference?: string;
    userId?: string | null;
  },
) {
  const qty = new Decimal(params.quantity);
  const cost = new Decimal(params.unitCost);
  
  if (qty.isZero()) {
    throw new Error("Adjustment quantity cannot be zero.");
  }

  const direction: StockMoveDirection = qty.isPositive() ? "IN" : "OUT";
  const absQty = qty.abs();
  const value = absQty.mul(cost);

  // Business Rule: Prevent negative stock
  if (direction === "OUT") {
    const currentStock = await getCurrentStock(tx, params.productId);
    if (currentStock.quantityOnHand.minus(absQty).isNegative()) {
      throw new Error("Adjustment would result in negative stock, which is prevented by business rules.");
    }
  }

  const move = await tx.stockMove.create({
    data: {
      productId: params.productId,
      moveType: StockMoveType.ADJUSTMENT,
      direction,
      date: new Date(),
      quantity: absQty,
      unitCost: cost,
      value: value,
      reference: params.reference || "Manual Adjustment",
      createdById: params.userId,
    },
  });

  return move;
}
