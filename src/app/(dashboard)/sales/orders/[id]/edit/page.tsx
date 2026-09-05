import { SalesOrderStatus } from "@prisma/client";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { listAnalyticOptions } from "@/modules/analytic/analytic-service";
import { listCustomerOptions } from "@/modules/contacts/contact-service";
import { listProductOptions } from "@/modules/products/product-service";
import { updateSalesOrderAction } from "@/modules/sales/actions";
import { getSalesOrder } from "@/modules/sales/sales-order-service";
import { OrderForm } from "@/modules/shared/components/order-form";
import { listTaxOptions } from "@/modules/taxes/tax-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit sales order" };

export default async function EditSalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("transaction:update");
  const { id } = await params;

  const order = await getSalesOrder(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  // Only drafts are editable; the service enforces this too.
  if (order.status !== SalesOrderStatus.DRAFT) redirect(`/sales/orders/${id}`);

  const [customers, products, taxes, analyticAccounts] = await Promise.all([
    listCustomerOptions(),
    listProductOptions(),
    listTaxOptions("SALE"),
    listAnalyticOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={`Edit ${order.number}`} description="Only draft orders can be edited." />

      <OrderForm
        action={updateSalesOrderAction.bind(null, id)}
        partners={customers}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.salesPrice.toString(),
          taxId: product.salesTaxId,
        }))}
        taxes={taxes.map((tax) => ({ id: tax.id, name: tax.name, rate: tax.rate }))}
        analyticAccounts={analyticAccounts.map((analytic) => ({
          id: analytic.id,
          label: `${analytic.code} · ${analytic.name}`,
        }))}
        initialValues={{
          partnerId: order.customerId,
          orderDate: order.orderDate.toISOString().slice(0, 10),
          reference: order.reference ?? "",
          notes: order.notes ?? "",
          lines: order.lines.map((line, index) => ({
            key: `existing-${index}`,
            productId: line.productId ?? "none",
            description: line.description,
            quantity: line.quantity.toString(),
            unitPrice: line.unitPrice.toString(),
            taxId: line.taxId ?? "none",
            analyticAccountId: line.analyticAccountId ?? "none",
          })),
        }}
        submitLabel="Save changes"
        cancelHref={`/sales/orders/${id}`}
        partnerLabel="Customer"
        partnerFieldName="customerId"
        successHref="/sales/orders"
        listHref="/sales/orders"
      />
    </div>
  );
}
