import {
  type InvoiceStatus,
  type PurchaseOrderStatus,
  type SalesOrderStatus,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

/**
 * Document status badges.
 *
 * One place for the colour language, so a "Posted" bill and a "Posted" invoice
 * always look the same wherever they appear.
 */

const PURCHASE_ORDER_STATUS: Record<PurchaseOrderStatus, { label: string; variant: BadgeVariant }> =
  {
    DRAFT: { label: "Draft", variant: "secondary" },
    CONFIRMED: { label: "Confirmed", variant: "default" },
    BILLED: { label: "Billed", variant: "success" },
    CANCELLED: { label: "Cancelled", variant: "destructive" },
  };

const SALES_ORDER_STATUS: Record<SalesOrderStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  CONFIRMED: { label: "Confirmed", variant: "default" },
  INVOICED: { label: "Invoiced", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  POSTED: { label: "Posted", variant: "default" },
  PARTIALLY_PAID: { label: "Partially paid", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

export function OrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const config = PURCHASE_ORDER_STATUS[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function SalesOrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  const config = SALES_ORDER_STATUS[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/** Shared by vendor bills and customer invoices -- they have one lifecycle. */
export function BillStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = INVOICE_STATUS[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export { BillStatusBadge as InvoiceStatusBadge };
