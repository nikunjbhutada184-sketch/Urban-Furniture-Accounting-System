import type { Prisma, Product, ProductType } from "@prisma/client";
import { type ListParams, toSkipTake } from "@/lib/list-params";
import { archiveWhere, searchWhere } from "@/modules/shared/list-filters";
import { recordAudit } from "@/server/audit/audit-service";
import { type DbClient, prisma } from "@/server/db/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { toAmountString } from "@/server/money";
import { type ProductInput, type ProductSortField } from "./schemas";

/**
 * Product master data service.
 *
 * Products are archived, never deleted: they are named on historic order,
 * bill and invoice lines that must stay readable.
 */

export interface ProductListRow {
  id: string;
  name: string;
  sku: string | null;
  type: ProductType;
  /** Serialised for the client boundary -- Decimal is not serialisable. */
  salesPrice: string;
  cost: string;
  categoryName: string | null;
  imageUrl: string | null;
  trackInventory: boolean;
  isArchived: boolean;
}

function buildWhere(params: ListParams<ProductSortField>): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { ...archiveWhere(params.filters.status) };

  if (params.filters.type) where.type = params.filters.type as ProductType;
  if (params.filters.category) where.categoryId = params.filters.category;
  if (params.search) Object.assign(where, searchWhere(params.search, ["name", "sku"]));

  return where;
}

export async function listProducts(
  params: ListParams<ProductSortField>,
  client: DbClient = prisma,
): Promise<{ rows: ProductListRow[]; total: number }> {
  const where = buildWhere(params);
  const { skip, take } = toSkipTake(params);

  const [records, total] = await Promise.all([
    client.product.findMany({
      where,
      orderBy: [{ [params.sort]: params.direction }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        name: true,
        sku: true,
        type: true,
        salesPrice: true,
        cost: true,
        imageUrl: true,
        trackInventory: true,
        isArchived: true,
        category: { select: { name: true } },
      },
    }),
    client.product.count({ where }),
  ]);

  return {
    total,
    rows: records.map((record) => ({
      id: record.id,
      name: record.name,
      sku: record.sku,
      type: record.type,
      salesPrice: toAmountString(record.salesPrice),
      cost: toAmountString(record.cost),
      categoryName: record.category?.name ?? null,
      imageUrl: record.imageUrl,
      trackInventory: record.trackInventory,
      isArchived: record.isArchived,
    })),
  };
}

export async function getProduct(id: string, client: DbClient = prisma): Promise<Product> {
  const product = await client.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError("Product", id);
  return product;
}

export async function listProductCategories(client: DbClient = prisma) {
  return client.productCategory.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Products selectable on documents. */
export async function listProductOptions(client: DbClient = prisma) {
  return client.product.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      salesPrice: true,
      cost: true,
      salesTaxId: true,
      purchaseTaxId: true,
      incomeAccountId: true,
      expenseAccountId: true,
      trackInventory: true,
    },
  });
}

async function assertSkuAvailable(
  client: DbClient,
  sku: string | null,
  excludeId?: string,
): Promise<void> {
  if (!sku) return;

  const existing = await client.product.findFirst({
    where: { sku, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`SKU "${sku}" is already used by another product.`, {
      fieldErrors: { sku: "This SKU is already in use." },
    });
  }
}

/** Resolves the category, creating it when the form supplied a new name. */
async function resolveCategoryId(tx: DbClient, input: ProductInput): Promise<string | null> {
  if (input.newCategory) {
    const existing = await tx.productCategory.findFirst({
      where: { name: { equals: input.newCategory, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.productCategory.create({ data: { name: input.newCategory } });
    return created.id;
  }

  return input.categoryId;
}

function toProductData(input: ProductInput, categoryId: string | null) {
  return {
    name: input.name,
    sku: input.sku,
    type: input.type,
    salesPrice: input.salesPrice,
    cost: input.cost,
    categoryId,
    incomeAccountId: input.incomeAccountId,
    expenseAccountId: input.expenseAccountId,
    salesTaxId: input.salesTaxId,
    purchaseTaxId: input.purchaseTaxId,
    imageUrl: input.imageUrl,
    trackInventory: input.trackInventory,
  };
}

export async function createProduct(
  tx: DbClient,
  input: ProductInput,
  context: { userId?: string | null } = {},
): Promise<Product> {
  await assertSkuAvailable(tx, input.sku);
  const categoryId = await resolveCategoryId(tx, input);

  const product = await tx.product.create({ data: toProductData(input, categoryId) });

  await recordAudit(
    tx,
    {
      action: "create",
      entity: "Product",
      entityId: product.id,
      summary: `Created product ${product.name}`,
    },
    context,
  );

  return product;
}

export async function updateProduct(
  tx: DbClient,
  id: string,
  input: ProductInput,
  context: { userId?: string | null } = {},
): Promise<Product> {
  await getProduct(id, tx);
  await assertSkuAvailable(tx, input.sku, id);
  const categoryId = await resolveCategoryId(tx, input);

  const product = await tx.product.update({
    where: { id },
    data: toProductData(input, categoryId),
  });

  await recordAudit(
    tx,
    {
      action: "update",
      entity: "Product",
      entityId: id,
      summary: `Updated product ${product.name}`,
    },
    context,
  );

  return product;
}

export async function setProductArchived(
  tx: DbClient,
  id: string,
  isArchived: boolean,
  context: { userId?: string | null } = {},
): Promise<Product> {
  const existing = await getProduct(id, tx);
  if (existing.isArchived === isArchived) return existing;

  const product = await tx.product.update({ where: { id }, data: { isArchived } });

  await recordAudit(
    tx,
    {
      action: isArchived ? "archive" : "restore",
      entity: "Product",
      entityId: id,
      summary: `${isArchived ? "Archived" : "Restored"} product ${product.name}`,
    },
    context,
  );

  return product;
}

export async function countProductReferences(
  id: string,
  client: DbClient = prisma,
): Promise<number> {
  const [poLines, soLines, billLines, invoiceLines, stockMoves] = await Promise.all([
    client.purchaseOrderLine.count({ where: { productId: id } }),
    client.salesOrderLine.count({ where: { productId: id } }),
    client.vendorBillLine.count({ where: { productId: id } }),
    client.customerInvoiceLine.count({ where: { productId: id } }),
    client.stockMove.count({ where: { productId: id } }),
  ]);

  return poLines + soLines + billLines + invoiceLines + stockMoves;
}

export async function assertProductDeletable(client: DbClient, id: string): Promise<void> {
  const references = await countProductReferences(id, client);

  if (references > 0) {
    throw new ValidationError(
      `This product appears on ${references} document line(s) and cannot be deleted. Archive it instead.`,
    );
  }
}
