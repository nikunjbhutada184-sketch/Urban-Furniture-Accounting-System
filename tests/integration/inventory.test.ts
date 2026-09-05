import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adjustStock, getCurrentStock, listStock } from "@/modules/inventory/stock-service";
import { ValidationError } from "@/server/errors";

/**
 * Inventory against a real database.
 *
 * Stock is derived from the move history, never stored as a mutable counter,
 * so these tests assert the aggregation and the negative-stock guard.
 */

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("inventory (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  let productId: string;
  let serviceProductId: string;

  beforeAll(async () => {
    const [goods, service] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { sku: "UF-SOFA-001" } }),
      prisma.product.findUniqueOrThrow({ where: { sku: "UF-SVC-ASSEMBLY" } }),
    ]);

    productId = goods.id;
    serviceProductId = service.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("adds stock with a positive adjustment", async () => {
    const before = await getCurrentStock(productId, prisma);

    await prisma.$transaction((tx) =>
      adjustStock(tx, {
        productId,
        quantity: "10",
        unitCost: "17500.0000",
        reference: "Opening count",
      }),
    );

    const after = await getCurrentStock(productId, prisma);

    expect(after.quantityOnHand.minus(before.quantityOnHand).toFixed(3)).toBe("10.000");
    expect(after.valueOnHand.minus(before.valueOnHand).toFixed(2)).toBe("175000.00");
  });

  it("removes stock with a negative adjustment", async () => {
    const before = await getCurrentStock(productId, prisma);

    await prisma.$transaction((tx) =>
      adjustStock(tx, {
        productId,
        quantity: "-4",
        unitCost: "17500.0000",
        reference: "Damaged in transit",
      }),
    );

    const after = await getCurrentStock(productId, prisma);
    expect(before.quantityOnHand.minus(after.quantityOnHand).toFixed(3)).toBe("4.000");
  });

  it("refuses to take stock below zero", async () => {
    const current = await getCurrentStock(productId, prisma);
    const tooMany = current.quantityOnHand.plus(1).toFixed(3);

    await expect(
      prisma.$transaction((tx) =>
        adjustStock(tx, {
          productId,
          quantity: `-${tooMany}`,
          unitCost: "17500.0000",
          reference: "Impossible write-off",
        }),
      ),
    ).rejects.toThrow(ValidationError);

    // The failed attempt changed nothing.
    const after = await getCurrentStock(productId, prisma);
    expect(after.quantityOnHand.toFixed(3)).toBe(current.quantityOnHand.toFixed(3));
  });

  it("refuses a zero-quantity adjustment", async () => {
    await expect(
      prisma.$transaction((tx) =>
        adjustStock(tx, {
          productId,
          quantity: "0",
          unitCost: "100.0000",
          reference: null,
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("refuses to adjust a product that does not track inventory", async () => {
    await expect(
      prisma.$transaction((tx) =>
        adjustStock(tx, {
          productId: serviceProductId,
          quantity: "1",
          unitCost: "100.0000",
          reference: null,
        }),
      ),
    ).rejects.toThrow(/not inventory-tracked/);
  });

  it("refuses an unknown product", async () => {
    await expect(
      prisma.$transaction((tx) =>
        adjustStock(tx, {
          productId: "product_does_not_exist",
          quantity: "1",
          unitCost: "100.0000",
          reference: null,
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("lists on-hand stock consistent with the per-product balance", async () => {
    const rows = await listStock(prisma);
    const row = rows.find((candidate) => candidate.productId === productId);
    const balance = await getCurrentStock(productId, prisma);

    expect(row).toBeDefined();
    expect(row?.quantityOnHand).toBe(balance.quantityOnHand.toFixed(2));
  });
});
