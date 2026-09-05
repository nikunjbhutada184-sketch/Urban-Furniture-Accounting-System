import { type InvoiceStatus, type PurchaseOrderStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

const ORDER_STATUS: Record<PurchaseOrderStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  CONFIRMED: { label: "Confirmed", variant: "default" },
  BILLED: { label: "Billed", variant: "success" },
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
  const config = ORDER_STATUS[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function BillStatusBadge({ status }: { status: InvoiceStatus }) {
  const config = INVOICE_STATUS[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
