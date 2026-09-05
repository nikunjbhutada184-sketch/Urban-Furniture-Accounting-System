"use client";

import { type Product, ProductType } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";
import { PRODUCT_TYPE_OPTIONS } from "../schemas";

export interface Option {
  id: string;
  label: string;
}

export function ProductForm({
  action,
  product,
  categories,
  incomeAccounts,
  expenseAccounts,
  taxes,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  product?: Product;
  categories: Option[];
  incomeAccounts: Option[];
  expenseAccounts: Option[];
  taxes: Option[];
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [type, setType] = useState<string>(product?.type ?? ProductType.GOODS);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/products");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const previous = (state.values ?? {}) as Record<string, string | undefined>;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="name" label="Product name" error={error("name")} required>
              <Input
                {...fieldProps("name", error("name"))}
                defaultValue={previous.name ?? product?.name ?? ""}
                placeholder="e.g. Office Chair"
                maxLength={160}
                autoFocus
                required
              />
            </Field>
          </div>

          <Field name="type" label="Type" error={error("type")} required>
            <Select name="type" value={type} onValueChange={setType}>
              <SelectTrigger id="type" aria-invalid={error("type") ? true : undefined}>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field name="sku" label="SKU" error={error("sku")} hint="Optional, must be unique.">
            <Input
              {...fieldProps("sku", error("sku"))}
              defaultValue={previous.sku ?? product?.sku ?? ""}
              placeholder="UF-CHAIR-001"
              maxLength={64}
            />
          </Field>

          <Field
            name="salesPrice"
            label="Sales price"
            error={error("salesPrice")}
            hint="Default price on customer invoices."
            required
          >
            <Input
              {...fieldProps("salesPrice", error("salesPrice"))}
              defaultValue={previous.salesPrice ?? product?.salesPrice?.toString() ?? "0"}
              inputMode="decimal"
              className="tabular"
              required
            />
          </Field>

          <Field
            name="cost"
            label="Purchase price"
            error={error("cost")}
            hint="Default price on vendor bills."
            required
          >
            <Input
              {...fieldProps("cost", error("cost"))}
              defaultValue={previous.cost ?? product?.cost?.toString() ?? "0"}
              inputMode="decimal"
              className="tabular"
              required
            />
          </Field>

          <Field name="categoryId" label="Category" error={error("categoryId")}>
            <Select
              name="categoryId"
              defaultValue={previous.categoryId ?? product?.categoryId ?? "none"}
            >
              <SelectTrigger id="categoryId">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            name="newCategory"
            label="Or create a category"
            error={error("newCategory")}
            hint="Takes precedence over the selection above."
          >
            <Input
              {...fieldProps("newCategory", error("newCategory"))}
              defaultValue={previous.newCategory ?? ""}
              placeholder="e.g. Outdoor"
              maxLength={80}
            />
          </Field>

          {type === ProductType.GOODS ? (
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="trackInventory"
                  defaultChecked={product?.trackInventory ?? false}
                  className="border-input size-4 rounded border"
                />
                Track inventory for this product
              </label>
              {error("trackInventory") ? (
                <p role="alert" className="text-destructive mt-1 text-xs">
                  {error("trackInventory")}
                </p>
              ) : null}
              <p className="text-muted-foreground mt-1 text-xs">
                Records stock movements when bills and invoices are posted.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            name="incomeAccountId"
            label="Income account"
            error={error("incomeAccountId")}
            hint="Credited when this product is sold."
          >
            <Select
              name="incomeAccountId"
              defaultValue={previous.incomeAccountId ?? product?.incomeAccountId ?? "none"}
            >
              <SelectTrigger id="incomeAccountId">
                <SelectValue placeholder="Company default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Company default</SelectItem>
                {incomeAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            name="expenseAccountId"
            label="Expense account"
            error={error("expenseAccountId")}
            hint="Debited when this product is purchased."
          >
            <Select
              name="expenseAccountId"
              defaultValue={previous.expenseAccountId ?? product?.expenseAccountId ?? "none"}
            >
              <SelectTrigger id="expenseAccountId">
                <SelectValue placeholder="Company default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Company default</SelectItem>
                {expenseAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field name="salesTaxId" label="Sales tax" error={error("salesTaxId")}>
            <Select
              name="salesTaxId"
              defaultValue={previous.salesTaxId ?? product?.salesTaxId ?? "none"}
            >
              <SelectTrigger id="salesTaxId">
                <SelectValue placeholder="No tax" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tax</SelectItem>
                {taxes.map((tax) => (
                  <SelectItem key={tax.id} value={tax.id}>
                    {tax.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field name="purchaseTaxId" label="Purchase tax" error={error("purchaseTaxId")}>
            <Select
              name="purchaseTaxId"
              defaultValue={previous.purchaseTaxId ?? product?.purchaseTaxId ?? "none"}
            >
              <SelectTrigger id="purchaseTaxId">
                <SelectValue placeholder="No tax" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tax</SelectItem>
                {taxes.map((tax) => (
                  <SelectItem key={tax.id} value={tax.id}>
                    {tax.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Button type="button" variant="ghost" asChild>
          <Link href="/products">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
