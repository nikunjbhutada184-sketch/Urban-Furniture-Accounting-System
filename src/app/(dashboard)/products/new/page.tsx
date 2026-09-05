import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { listAccountOptions } from "@/modules/accounts/account-service";
import { createProductAction } from "@/modules/products/actions";
import { ProductForm } from "@/modules/products/components/product-form";
import { listProductCategories } from "@/modules/products/product-service";
import { listTaxOptions } from "@/modules/taxes/tax-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requirePermissionOrRedirect("master:create");

  const [categories, incomeAccounts, expenseAccounts, taxes] = await Promise.all([
    listProductCategories(),
    listAccountOptions({ type: "INCOME" }),
    listAccountOptions({ type: "EXPENSE" }),
    listTaxOptions(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="New product" description="Add a product or service." />
      <ProductForm
        action={createProductAction}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        incomeAccounts={incomeAccounts.map((a) => ({ id: a.id, label: a.label }))}
        expenseAccounts={expenseAccounts.map((a) => ({ id: a.id, label: a.label }))}
        taxes={taxes.map((t) => ({ id: t.id, label: t.name }))}
        submitLabel="Create product"
      />
    </div>
  );
}
