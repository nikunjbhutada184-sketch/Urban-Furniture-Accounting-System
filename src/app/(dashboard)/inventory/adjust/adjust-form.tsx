"use client";

import { useTransition } from "react";
import { adjustStockAction } from "@/modules/inventory/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function AdjustStockForm({ products }: { products: { id: string; name: string; cost: any }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const result = await adjustStockAction({
        productId: formData.get("productId") as string,
        quantity: parseFloat(formData.get("quantity") as string),
        unitCost: parseFloat(formData.get("unitCost") as string),
        reference: formData.get("reference") as string,
      });

      if (!result.success) {
        setError(result.error || "Failed to adjust stock");
      } else {
        router.push("/inventory");
        router.refresh();
      }
    });
  }

  return (
    <Card className="max-w-2xl mx-auto border-emerald-100 shadow-sm">
      <CardHeader className="bg-emerald-50/50 border-b border-emerald-100">
        <CardTitle className="text-emerald-800">New Stock Adjustment</CardTitle>
        <CardDescription>
          Record a manual inventory adjustment. Use positive quantities to add stock, and negative quantities to remove stock.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}
          
          <div className="space-y-2">
            <Label htmlFor="productId">Product</Label>
            <Select name="productId" required>
              <SelectTrigger className="border-emerald-200 focus:ring-emerald-500">
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity (Positive/Negative)</Label>
              <Input id="quantity" name="quantity" type="number" step="0.001" required className="border-emerald-200 focus-visible:ring-emerald-500" placeholder="e.g. -5 or 10" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="unitCost">Unit Cost (Rs.)</Label>
              <Input id="unitCost" name="unitCost" type="number" step="0.01" required min="0" className="border-emerald-200 focus-visible:ring-emerald-500" placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference">Reference / Reason</Label>
            <Input id="reference" name="reference" className="border-emerald-200 focus-visible:ring-emerald-500" placeholder="e.g. Broken in transit, Physical count variance" />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-emerald-100">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {isPending ? "Saving..." : "Adjust Stock"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
