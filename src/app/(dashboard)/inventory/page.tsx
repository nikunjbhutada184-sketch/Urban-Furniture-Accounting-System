import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStock } from "@/modules/inventory/stock-service";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Stock" };

export default async function InventoryPage() {
  const actor = await requirePermissionOrRedirect("transaction:view");
  const rows = await listStock();

  const canAdjust = can(actor, "transaction:create");
  const totalValue = rows.reduce((total, row) => total + Number(row.valueOnHand), 0);
  const outOfStock = rows.filter((row) => Number(row.quantityOnHand) <= 0).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Stock"
        description="On-hand quantity and value for inventory-tracked products."
        action={canAdjust ? { label: "Adjust stock", href: "/inventory/adjust" } : undefined}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <EmptyState
            title="No tracked products"
            description="Enable stock tracking on a product to see it here. Only goods can be inventory-tracked."
            action={{ label: "Go to products", href: "/products" }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Movements</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => {
                const quantity = Number(row.quantityOnHand);

                return (
                  <TableRow key={row.productId}>
                    <TableCell>
                      <Link
                        href={`/inventory/${row.productId}`}
                        className="font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                      {row.sku ? (
                        <div className="text-muted-foreground text-xs">{row.sku}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      <span className={quantity <= 0 ? "text-destructive font-medium" : ""}>
                        {row.quantityOnHand}
                      </span>
                      {quantity <= 0 ? (
                        <Badge variant="destructive" className="ml-2">
                          Out of stock
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular text-right">{row.valueOnHand}</TableCell>
                    <TableCell className="tabular text-muted-foreground text-right">
                      {row.moveCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/inventory/${row.productId}`}>History</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell>
                  {rows.length} product{rows.length === 1 ? "" : "s"}
                  {outOfStock > 0 ? ` · ${outOfStock} out of stock` : ""}
                </TableCell>
                <TableCell />
                <TableCell className="tabular text-right">
                  {totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  );
}
