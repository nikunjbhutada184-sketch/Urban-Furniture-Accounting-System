import { PurchaseOrderStatus } from "@prisma/client";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { listAnalyticOptions } from "@/modules/analytic/analytic-service";
import { listVendorOptions } from "@/modules/contacts/contact-service";
import { listProductOptions } from "@/modules/products/product-service";
import { updatePurchaseOrderAction } from "@/modules/purchases/actions";
import { PurchaseOrderForm } from "@/modules/purchases/components/purchase-order-form";
import { getPurchaseOrder } from "@/modules/purchases/purchase-order-service";
import { listTaxOptions } from "@/modules/taxes/tax-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionOrRedirect("transaction:update");
  const { id } = await params;

  const order = await getPurchaseOrder(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  // Only drafts are editable; the service enforces this too.
  if (order.status !== PurchaseOrderStatus.DRAFT) {
    redirect(`/purchases/orders/${id}`);
  }

  const [vendors, products, taxes, analyticAccounts] = await Promise.all([
    listVendorOptions(),
    listProductOptions(),
    listTaxOptions("PURCHASE"),
    listAnalyticOptions(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title={`Edit ${order.number}`} description="Only draft orders can be edited." />

      <PurchaseOrderForm
        action={updatePurchaseOrderAction.bind(null, id)}
        vendors={vendors}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          cost: product.cost.toString(),
          purchaseTaxId: product.purchaseTaxId,
        }))}
        taxes={taxes.map((tax) => ({ id: tax.id, name: tax.name, rate: tax.rate }))}
        analyticAccounts={analyticAccounts.map((analytic) => ({
          id: analytic.id,
          label: `${analytic.code} · ${analytic.name}`,
        }))}
        initialValues={{
          vendorId: order.vendorId,
          orderDate: order.orderDate.toISOString().slice(0, 10),
          expectedDate: order.expectedDate?.toISOString().slice(0, 10) ?? "",
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
        cancelHref={`/purchases/orders/${id}`}
      />
    </div>
  );
}
