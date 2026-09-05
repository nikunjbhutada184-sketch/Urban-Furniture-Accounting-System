import { ProductType } from "@prisma/client";
import { z } from "zod";
import {
  decimalString,
  optionalId,
  optionalText,
  requiredText,
} from "@/modules/shared/zod-helpers";

export const PRODUCT_TYPE_OPTIONS = [
  { value: ProductType.GOODS, label: "Goods" },
  { value: ProductType.SERVICE, label: "Service" },
  { value: ProductType.COMBO, label: "Combo" },
] as const;

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  [ProductType.GOODS]: "Goods",
  [ProductType.SERVICE]: "Service",
  [ProductType.COMBO]: "Combo",
};

export const PRODUCT_SORT_FIELDS = [
  "name",
  "type",
  "salesPrice",
  "cost",
  "createdAt",
  "updatedAt",
] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

/**
 * Product master data.
 *
 * Prices are kept as strings all the way to Prisma so they land in the
 * database as exact NUMERIC(18,4) values -- they are never parsed into a
 * JavaScript number.
 */
export const productInputSchema = z
  .object({
    name: requiredText("Product name", 160),
    sku: optionalText("SKU", 64),
    type: z.nativeEnum(ProductType, {
      errorMap: () => ({ message: "Select a product type." }),
    }),
    salesPrice: decimalString("Sales price", { scale: 4 }),
    cost: decimalString("Purchase price", { scale: 4 }),
    categoryId: optionalId(),
    /** Creates a new category when filled in; takes precedence over categoryId. */
    newCategory: optionalText("Category name", 80),
    incomeAccountId: optionalId(),
    expenseAccountId: optionalId(),
    salesTaxId: optionalId(),
    purchaseTaxId: optionalId(),
    trackInventory: z
      .union([z.literal("on"), z.literal("true"), z.literal("false"), z.undefined()])
      .transform((value) => value === "on" || value === "true"),
  })
  .refine((value) => value.type === ProductType.GOODS || !value.trackInventory, {
    message: "Only goods can be inventory-tracked.",
    path: ["trackInventory"],
  });

export type ProductInput = z.infer<typeof productInputSchema>;
