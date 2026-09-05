import { z } from "zod";
import { decimalString, optionalText, requiredText } from "@/modules/shared/zod-helpers";

/**
 * Stock adjustment input.
 *
 * Quantity and cost stay strings all the way to Prisma so they land as exact
 * NUMERIC values. A stock adjustment is a correction, so the quantity may be
 * negative -- but it may never be zero, which would be a no-op move.
 */
export const stockAdjustmentSchema = z.object({
  productId: requiredText("Product", 40),
  /** Signed: positive adds stock, negative removes it. */
  quantity: decimalString("Quantity", { scale: 3, min: -1_000_000_000, allowZero: false }),
  unitCost: decimalString("Unit cost", { scale: 4 }),
  reference: optionalText("Reference", 120),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const STOCK_SORT_FIELDS = ["name", "sku"] as const;
export type StockSortField = (typeof STOCK_SORT_FIELDS)[number];
