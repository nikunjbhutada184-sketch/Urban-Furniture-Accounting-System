import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { listAnalyticOptions } from "@/modules/analytic/analytic-service";
import { listVendorOptions } from "@/modules/contacts/contact-service";
import { listProductOptions } from "@/modules/products/product-service";
import { OrderForm } from "@/modules/shared/components/order-form";
import { createPurchaseOrderAction } from "@/modules/purchases/actions";
import { listTaxOptions } from "@/modules/taxes/tax-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  await requirePermissionOrRedirect("transaction:create");

  const [vendors, products, taxes, analyticAccounts] = await Promise.all([
    listVendorOptions(),
    listProductOptions(),
    listTaxOptions("PURCHASE"),
    listAnalyticOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="New purchase order"
        description="Select a vendor and the products you are ordering."
      />

      <OrderForm
        action={createPurchaseOrderAction}
        partners={vendors}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.cost.toString(),
          taxId: product.purchaseTaxId,
        }))}
        taxes={taxes.map((tax) => ({ id: tax.id, name: tax.name, rate: tax.rate }))}
        analyticAccounts={analyticAccounts.map((analytic) => ({
          id: analytic.id,
          label: `${analytic.code} · ${analytic.name}`,
        }))}
        submitLabel="Create purchase order"
        cancelHref="/purchases/orders"
        partnerLabel="Vendor"
        partnerFieldName="vendorId"
        successHref="/purchases/orders"
        listHref="/purchases/orders"
      />
    </div>
  );
}
