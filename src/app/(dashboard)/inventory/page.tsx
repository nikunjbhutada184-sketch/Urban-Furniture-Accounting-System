import { prisma } from "@/server/db/prisma";
import { getCurrentStock } from "@/modules/inventory/stock-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function InventoryPage() {
  const products = await prisma.product.findMany({
    where: { trackInventory: true, isArchived: false },
    select: { id: true, name: true, sku: true, cost: true },
    orderBy: { name: "asc" }
  });

  const stockBalances = await Promise.all(
    products.map(async (product) => {
      const balance = await getCurrentStock(prisma, product.id);
      return {
        ...product,
        quantityOnHand: balance.quantityOnHand,
        valueOnHand: balance.valueOnHand,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-emerald-900">Inventory</h1>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/inventory/adjust">
            <Plus className="mr-2 h-4 w-4" /> Adjust Stock
          </Link>
        </Button>
      </div>

      <Card className="border-emerald-100 shadow-sm">
        <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 pb-4">
          <CardTitle className="text-emerald-800">Stock Levels</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-emerald-50/30">
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">On Hand</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockBalances.map((item) => (
                <TableRow key={item.id} className="hover:bg-emerald-50/20">
                  <TableCell className="font-medium text-emerald-900">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.sku || "-"}</TableCell>
                  <TableCell className="text-right">{item.quantityOnHand.toNumber().toFixed(3)}</TableCell>
                  <TableCell className="text-right">Rs. {item.cost.toNumber().toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">Rs. {item.valueOnHand.toNumber().toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {item.quantityOnHand.toNumber() <= 5 ? (
                      <Badge variant="destructive" className="bg-rose-500">Low Stock</Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">In Stock</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100">
                      <Link href={`/inventory/${item.id}`}>History</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {stockBalances.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No tracked products found. Enable "Track Inventory" on a product to see it here.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
