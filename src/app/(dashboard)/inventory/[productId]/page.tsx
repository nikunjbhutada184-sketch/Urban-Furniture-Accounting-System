import { prisma } from "@/server/db/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default async function ProductStockHistoryPage(props: { params: Promise<{ productId: string }> }) {
  const params = await props.params;
  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    include: {
      stockMoves: {
        orderBy: { date: 'desc' },
        include: {
          createdBy: { select: { name: true } }
        }
      }
    }
  });

  if (!product) notFound();

  // Re-calculate running balance (we iterate from oldest to newest)
  const movesAsc = [...product.stockMoves].reverse();
  let runningQty = 0;
  const movesWithBalance = movesAsc.map(move => {
    const qty = move.quantity.toNumber();
    if (move.direction === "IN") {
      runningQty += qty;
    } else {
      runningQty -= qty;
    }
    return { ...move, runningQty };
  }).reverse(); // Reverse back for display

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="icon" asChild className="border-emerald-200 text-emerald-800 hover:bg-emerald-50">
          <Link href="/inventory">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-900 flex items-center">
            <Package className="mr-3 h-8 w-8 text-emerald-600" />
            {product.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            SKU: {product.sku || "N/A"} | Cost: Rs. {product.cost.toNumber().toFixed(2)}
          </p>
        </div>
      </div>

      <Card className="border-emerald-100 shadow-sm">
        <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 pb-4">
          <CardTitle className="text-emerald-800">Stock Movement History (Audit Trail)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-emerald-50/30">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movesWithBalance.map((move) => (
                <TableRow key={move.id} className="hover:bg-emerald-50/20">
                  <TableCell className="text-emerald-900">
                    {format(move.date, "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={move.direction === "IN" ? "default" : "secondary"} className={move.direction === "IN" ? "bg-emerald-500" : "bg-orange-100 text-orange-800"}>
                      {move.moveType.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{move.reference || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{move.createdBy?.name || "System"}</TableCell>
                  <TableCell className={`text-right font-medium ${move.direction === "IN" ? "text-emerald-600" : "text-orange-600"}`}>
                    {move.direction === "IN" ? "+" : "-"}{move.quantity.toNumber().toFixed(3)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">Rs. {move.unitCost.toNumber().toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-900">{move.runningQty.toFixed(3)}</TableCell>
                </TableRow>
              ))}
              {movesWithBalance.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No stock movements recorded for this product.
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
