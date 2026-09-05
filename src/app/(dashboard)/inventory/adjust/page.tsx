import { type Metadata } from "next";
import { EmptyState } from "@/components/data-table/empty-state";
import { PageHeader } from "@/components/page-header";
import { listAdjustableProducts } from "@/modules/inventory/stock-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { AdjustStockForm } from "./adjust-form";

export const metadata: Metadata = { title: "Adjust stock" };

export default async function AdjustStockPage() {
  await requirePermissionOrRedirect("transaction:create");
  const products = await listAdjustableProducts();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Adjust stock"
        description="Correct the recorded quantity after a stock count, breakage or write-off."
      />

      {products.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState
            title="No tracked products"
            description="Enable stock tracking on a goods product before adjusting stock."
            action={{ label: "Go to products", href: "/products" }}
          />
        </div>
      ) : (
        <AdjustStockForm products={products} />
      )}
    </div>
  );
}
