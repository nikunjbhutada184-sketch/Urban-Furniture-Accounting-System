"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adjustStockAction } from "@/modules/inventory/actions";
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";

export interface AdjustableProduct {
  id: string;
  name: string;
  /** Serialised cost, used to prefill the unit cost. */
  cost: string;
  quantityOnHand: string;
}

/**
 * Manual stock adjustment.
 *
 * Amounts are submitted as strings and validated server-side by the same Zod
 * schema the service uses, so nothing is parsed into a float on the way.
 */
export function AdjustStockForm({ products }: { products: AdjustableProduct[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(
    adjustStockAction,
    IDLE_STATE,
  );
  const [productId, setProductId] = useState(products[0]?.id ?? "");

  useEffect(() => {
    if (state.status === "success") {
      router.push("/inventory");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const selected = products.find((product) => product.id === productId);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock adjustment</CardTitle>
          <CardDescription>
            Corrects the recorded quantity for an inventory-tracked product. Use a positive
            quantity to add stock and a negative one to remove it.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="productId" label="Product" error={error("productId")} required>
              <Select name="productId" value={productId} onValueChange={setProductId}>
                <SelectTrigger
                  id="productId"
                  aria-invalid={error("productId") ? true : undefined}
                >
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} — {product.quantityOnHand} on hand
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            name="quantity"
            label="Quantity"
            error={error("quantity")}
            hint={
              selected
                ? `Currently ${selected.quantityOnHand} on hand. Negative removes stock.`
                : "Negative removes stock."
            }
            required
          >
            <Input
              {...fieldProps("quantity", error("quantity"))}
              defaultValue="1"
              inputMode="decimal"
              className="tabular"
              required
            />
          </Field>

          <Field
            name="unitCost"
            label="Unit cost"
            error={error("unitCost")}
            hint="Used to value the adjustment."
            required
          >
            <Input
              {...fieldProps("unitCost", error("unitCost"))}
              key={selected?.id ?? "none"}
              defaultValue={selected?.cost ?? "0"}
              inputMode="decimal"
              className="tabular"
              required
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              name="reference"
              label="Reason"
              error={error("reference")}
              hint="Why the correction was needed, e.g. a stock count or breakage."
            >
              <Input
                {...fieldProps("reference", error("reference"))}
                placeholder="Annual stock count"
                maxLength={120}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label="Adjust stock" />
        <Button type="button" variant="ghost" asChild>
          <Link href="/inventory">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
