import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { listAnalyticOptions } from "@/modules/analytic/analytic-service";
import { listCustomerOptions } from "@/modules/contacts/contact-service";
import { listProductOptions } from "@/modules/products/product-service";
import { createSalesOrderAction } from "@/modules/sales/actions";
import { OrderForm } from "@/modules/shared/components/order-form";
import { listTaxOptions } from "@/modules/taxes/tax-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New sales order" };

export default async function NewSalesOrderPage() {
  await requirePermissionOrRedirect("transaction:create");

  const [customers, products, taxes, analyticAccounts] = await Promise.all([
    listCustomerOptions(),
    listProductOptions(),
    listTaxOptions("SALE"),
    listAnalyticOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="New sales order"
        description="Select a customer and the products they are buying."
      />

      <OrderForm
        action={createSalesOrderAction}
        partners={customers}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          // Sales documents default to the sales price, not the cost.
          price: product.salesPrice.toString(),
          taxId: product.salesTaxId,
        }))}
        taxes={taxes.map((tax) => ({ id: tax.id, name: tax.name, rate: tax.rate }))}
        analyticAccounts={analyticAccounts.map((analytic) => ({
          id: analytic.id,
          label: `${analytic.code} · ${analytic.name}`,
        }))}
        submitLabel="Create sales order"
        cancelHref="/sales/orders"
        partnerLabel="Customer"
        partnerFieldName="customerId"
        successHref="/sales/orders"
        listHref="/sales/orders"
      />
    </div>
  );
}
