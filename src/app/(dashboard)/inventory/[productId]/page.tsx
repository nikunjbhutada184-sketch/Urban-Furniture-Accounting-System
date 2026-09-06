import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/data-table/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentStock, getStockMoves } from "@/modules/inventory/stock-service";
import { getProduct } from "@/modules/products/product-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";
import { type Decimal, ZERO, add, subtract, toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Stock history" };

/** Links a stock move back to the document that caused it. */
function sourceHref(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;

  switch (sourceType) {
    case "VendorBill":
      return `/purchases/bills/${sourceId}`;
    case "CustomerInvoice":
      return `/sales/invoices/${sourceId}`;
    default:
      return null;
  }
}

const MOVE_TYPE_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Goods received",
  SALE_DELIVERY: "Goods delivered",
  RETURN_IN: "Return in",
  RETURN_OUT: "Return out",
  ADJUSTMENT: "Adjustment",
  OPENING_BALANCE: "Opening balance",
};

export default async function ProductStockHistoryPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  await requirePermissionOrRedirect("transaction:view");
  const { productId } = await params;

  const product = await getProduct(productId).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const [balance, moves] = await Promise.all([
    getCurrentStock(productId),
    getStockMoves(productId),
  ]);

  // Moves come newest first; the running balance is computed oldest-first and
  // then re-reversed, so each row shows the balance as at that move.
  const oldestFirst = [...moves].reverse();
  const runningByMoveId = new Map<string, Decimal>();
  let running: Decimal = ZERO;

  for (const move of oldestFirst) {
    running = move.direction === "IN" ? add(running, move.quantity) : subtract(running, move.quantity);
    runningByMoveId.set(move.id, running);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={product.name}
        description="Every movement in and out, newest first."
        action={{ label: "Back to stock", href: "/inventory" }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "On hand", value: toAmountString(balance.quantityOnHand) },
          { label: "Stock value", value: toAmountString(balance.valueOnHand) },
          { label: "Movements", value: String(moves.length) },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="tabular text-sm font-medium">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movement history</CardTitle>
          <CardDescription>
            Purchases move stock in when a vendor bill is posted; sales move it out when a
            customer invoice is posted. Adjustments are manual corrections.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {moves.length === 0 ? (
            <EmptyState
              title="No movements yet"
              description="Stock moves are created when bills and invoices are posted, or by a manual adjustment."
              action={{ label: "Adjust stock", href: "/inventory/adjust" }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {moves.map((move) => {
                  const href = sourceHref(move.sourceType, move.sourceId);

                  return (
                    <TableRow key={move.id}>
                      <TableCell className="text-muted-foreground tabular">
                        {move.date.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={move.direction === "IN" ? "success" : "secondary"}>
                          {MOVE_TYPE_LABELS[move.moveType] ?? move.moveType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {href ? (
                          <Link href={href} className="hover:underline">
                            {move.reference ?? "—"}
                          </Link>
                        ) : (
                          (move.reference ?? "—")
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {move.direction === "IN" ? toAmountString(move.quantity) : ""}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {move.direction === "OUT" ? toAmountString(move.quantity) : ""}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {toAmountString(runningByMoveId.get(move.id) ?? 0)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {toAmountString(move.value)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
