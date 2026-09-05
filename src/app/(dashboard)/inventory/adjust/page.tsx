import { prisma } from "@/server/db/prisma";
import { AdjustStockForm } from "./adjust-form";

export default async function AdjustStockPage() {
  const products = await prisma.product.findMany({
    where: { trackInventory: true, isArchived: false },
    select: { id: true, name: true, cost: true },
    orderBy: { name: "asc" }
  });

  return (
    <div className="space-y-6">
      <AdjustStockForm products={products} />
    </div>
  );
}
