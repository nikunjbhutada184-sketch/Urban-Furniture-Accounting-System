import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { listAccountOptions } from "@/modules/accounts/account-service";
import { updateProductAction } from "@/modules/products/actions";
import { ProductForm } from "@/modules/products/components/product-form";
import {
  countProductReferences,
  getProduct,
  listProductCategories,
} from "@/modules/products/product-service";
import { listTaxOptions } from "@/modules/taxes/tax-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("master:update");
  const { id } = await params;

  const product = await getProduct(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const [categories, incomeAccounts, expenseAccounts, taxes, references] = await Promise.all([
    listProductCategories(),
    listAccountOptions({ type: "INCOME" }),
    listAccountOptions({ type: "EXPENSE" }),
    listTaxOptions(),
    countProductReferences(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={product.name} description="Edit product details.">
        {product.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
      </PageHeader>

      {references > 0 ? (
        <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
          This product appears on <span className="text-foreground font-medium">{references}</span>{" "}
          document line(s). Changing its price affects new documents only — posted documents keep
          the price they were posted with.
        </p>
      ) : null}

      <ProductForm
        action={updateProductAction.bind(null, id)}
        // Serialised at the boundary: Decimal cannot cross into a client
        // component, so prices are handed over as exact decimal strings.
        product={{
          name: product.name,
          sku: product.sku ?? "",
          type: product.type,
          salesPrice: product.salesPrice.toString(),
          cost: product.cost.toString(),
          categoryId: product.categoryId,
          incomeAccountId: product.incomeAccountId,
          expenseAccountId: product.expenseAccountId,
          salesTaxId: product.salesTaxId,
          purchaseTaxId: product.purchaseTaxId,
          trackInventory: product.trackInventory,
          imageUrl: product.imageUrl,
        }}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        incomeAccounts={incomeAccounts.map((a) => ({ id: a.id, label: a.label }))}
        expenseAccounts={expenseAccounts.map((a) => ({ id: a.id, label: a.label }))}
        taxes={taxes.map((t) => ({ id: t.id, label: t.name }))}
        submitLabel="Save changes"
      />
    </div>
  );
}
