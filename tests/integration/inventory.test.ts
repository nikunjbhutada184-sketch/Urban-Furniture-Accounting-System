import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adjustStock, getCurrentStock } from "@/modules/inventory/stock-service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDb = databaseUrl ? describe : describe.skip;

describeWithDb("Inventory module (database)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  
  let productId: string;

  beforeAll(async () => {
    // Create a dummy product for testing
    const category = await prisma.productCategory.create({
      data: { name: "Test Category " + Date.now() }
    });
    const product = await prisma.product.create({
      data: {
        name: "Test Inventory Product",
        trackInventory: true,
        cost: 50.00,
        categoryId: category.id,
      }
    });
    productId = product.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.stockMove.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.$disconnect();
  });

  it("calculates initial stock as zero", async () => {
    const stock = await getCurrentStock(prisma, productId);
    expect(stock.quantityOnHand.toNumber()).toBe(0);
    expect(stock.valueOnHand.toNumber()).toBe(0);
  });

  it("handles stock adjustments correctly", async () => {
    await prisma.$transaction(async (tx) => {
      await adjustStock(tx, {
        productId,
        quantity: 10,
        unitCost: 50,
      });
    });

    const stock = await getCurrentStock(prisma, productId);
    expect(stock.quantityOnHand.toNumber()).toBe(10);
    expect(stock.valueOnHand.toNumber()).toBe(500); // 10 * 50

    await prisma.$transaction(async (tx) => {
      await adjustStock(tx, {
        productId,
        quantity: -2,
        unitCost: 50,
      });
    });

    const stock2 = await getCurrentStock(prisma, productId);
    expect(stock2.quantityOnHand.toNumber()).toBe(8);
    expect(stock2.valueOnHand.toNumber()).toBe(400);
  });

  it("prevents negative stock", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await adjustStock(tx, {
          productId,
          quantity: -100,
          unitCost: 50,
        });
      })
    ).rejects.toThrow(/negative stock/);
  });
});
