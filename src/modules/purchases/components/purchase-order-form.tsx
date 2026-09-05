"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";

/**
 * Purchase order editor.
 *
 * The totals shown here are a live preview for the user's benefit. They are
 * NEVER trusted: the server recomputes every amount from quantity, price and
 * tax rate before saving. That is why the form submits raw line values, not
 * computed totals.
 */

export interface ProductOption {
  id: string;
  name: string;
  cost: string;
  purchaseTaxId: string | null;
}

export interface TaxOption {
  id: string;
  name: string;
  rate: string;
}

export interface LineDraft {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxId: string;
  analyticAccountId: string;
}

export interface PurchaseOrderFormValues {
  vendorId: string;
  orderDate: string;
  expectedDate: string;
  reference: string;
  notes: string;
  lines: LineDraft[];
}

let keyCounter = 0;
function newLine(): LineDraft {
  keyCounter += 1;
  return {
    key: `line-${keyCounter}`,
    productId: "none",
    description: "",
    quantity: "1",
    unitPrice: "0",
    taxId: "none",
    analyticAccountId: "none",
  };
}

/** Preview arithmetic only. Uses numbers deliberately -- nothing is persisted. */
function previewAmounts(line: LineDraft, taxes: TaxOption[]) {
  const quantity = Number(line.quantity) || 0;
  const unitPrice = Number(line.unitPrice) || 0;
  const subtotal = quantity * unitPrice;

  const tax = taxes.find((candidate) => candidate.id === line.taxId);
  const taxAmount = tax ? (subtotal * Number(tax.rate)) / 100 : 0;

  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

function formatPreview(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PurchaseOrderForm({
  action,
  vendors,
  products,
  taxes,
  analyticAccounts,
  initialValues,
  submitLabel,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  vendors: { id: string; name: string }[];
  products: ProductOption[];
  taxes: TaxOption[];
  analyticAccounts: { id: string; label: string }[];
  initialValues?: Partial<PurchaseOrderFormValues>;
  submitLabel: string;
  cancelHref: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, IDLE_STATE);

  const [lines, setLines] = useState<LineDraft[]>(
    initialValues?.lines?.length ? initialValues.lines : [newLine()],
  );

  useEffect(() => {
    if (state.status === "success") {
      router.push(state.id ? `/purchases/orders/${state.id}` : "/purchases/orders");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];

  const totals = useMemo(() => {
    return lines.reduce(
      (accumulator, line) => {
        const amounts = previewAmounts(line, taxes);
        return {
          untaxed: accumulator.untaxed + amounts.subtotal,
          tax: accumulator.tax + amounts.taxAmount,
          total: accumulator.total + amounts.total,
        };
      },
      { untaxed: 0, tax: 0, total: 0 },
    );
  }, [lines, taxes]);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onProductChange(key: string, productId: string) {
    const product = products.find((candidate) => candidate.id === productId);

    updateLine(key, {
      productId,
      ...(product
        ? {
            description: product.name,
            unitPrice: product.cost,
            taxId: product.purchaseTaxId ?? "none",
          }
        : {}),
    });
  }

  // Line errors come back keyed by index, e.g. "lines.0.quantity".
  const lineError = (index: number, field: string) => error(`lines.${index}.${field}`);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      {/* The server re-derives every amount from these raw values. */}
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          lines.map((line) => ({
            productId: line.productId === "none" ? "" : line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxId: line.taxId === "none" ? "" : line.taxId,
            analyticAccountId: line.analyticAccountId === "none" ? "" : line.analyticAccountId,
          })),
        )}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="vendorId" label="Vendor" error={error("vendorId")} required>
            <Select name="vendorId" defaultValue={initialValues?.vendorId ?? ""}>
              <SelectTrigger id="vendorId" aria-invalid={error("vendorId") ? true : undefined}>
                <SelectValue placeholder="Select a vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field name="reference" label="Reference" error={error("reference")}>
            <Input
              {...fieldProps("reference", error("reference"))}
              defaultValue={initialValues?.reference ?? ""}
              placeholder="Vendor quote number"
              maxLength={80}
            />
          </Field>

          <Field name="orderDate" label="Order date" error={error("orderDate")} required>
            <Input
              {...fieldProps("orderDate", error("orderDate"))}
              type="date"
              defaultValue={initialValues?.orderDate ?? new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>

          <Field
            name="expectedDate"
            label="Expected date"
            error={error("expectedDate")}
            hint="When the goods are expected."
          >
            <Input
              {...fieldProps("expectedDate", error("expectedDate"))}
              type="date"
              defaultValue={initialValues?.expectedDate ?? ""}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Lines</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, newLine()])}
          >
            <Plus aria-hidden />
            Add line
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {error("lines") ? (
            <p role="alert" className="text-destructive text-sm">
              {error("lines")}
            </p>
          ) : null}

          {lines.map((line, index) => {
            const amounts = previewAmounts(line, taxes);

            return (
              <div key={line.key} className="rounded-lg border p-3">
                <div className="grid gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      Product
                    </label>
                    <Select
                      value={line.productId}
                      onValueChange={(value) => onProductChange(line.key, value)}
                    >
                      <SelectTrigger aria-label={`Product for line ${index + 1}`}>
                        <SelectValue placeholder="Free text line" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Free text line</SelectItem>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-8">
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      Description
                    </label>
                    <Input
                      value={line.description}
                      onChange={(event) =>
                        updateLine(line.key, { description: event.target.value })
                      }
                      placeholder="What is being purchased"
                      aria-label={`Description for line ${index + 1}`}
                      aria-invalid={lineError(index, "description") ? true : undefined}
                      maxLength={300}
                    />
                    {lineError(index, "description") ? (
                      <p role="alert" className="text-destructive mt-1 text-xs">
                        {lineError(index, "description")}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      Quantity
                    </label>
                    <Input
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      inputMode="decimal"
                      className="tabular"
                      aria-label={`Quantity for line ${index + 1}`}
                      aria-invalid={lineError(index, "quantity") ? true : undefined}
                    />
                    {lineError(index, "quantity") ? (
                      <p role="alert" className="text-destructive mt-1 text-xs">
                        {lineError(index, "quantity")}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      Unit price
                    </label>
                    <Input
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                      inputMode="decimal"
                      className="tabular"
                      aria-label={`Unit price for line ${index + 1}`}
                      aria-invalid={lineError(index, "unitPrice") ? true : undefined}
                    />
                    {lineError(index, "unitPrice") ? (
                      <p role="alert" className="text-destructive mt-1 text-xs">
                        {lineError(index, "unitPrice")}
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      Tax
                    </label>
                    <Select
                      value={line.taxId}
                      onValueChange={(value) => updateLine(line.key, { taxId: value })}
                    >
                      <SelectTrigger aria-label={`Tax for line ${index + 1}`}>
                        <SelectValue placeholder="No tax" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No tax</SelectItem>
                        {taxes.map((tax) => (
                          <SelectItem key={tax.id} value={tax.id}>
                            {tax.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="text-muted-foreground mb-1 block text-xs font-medium">
                      Analytic account
                    </label>
                    <Select
                      value={line.analyticAccountId}
                      onValueChange={(value) => updateLine(line.key, { analyticAccountId: value })}
                    >
                      <SelectTrigger aria-label={`Analytic account for line ${index + 1}`}>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {analyticAccounts.map((analytic) => (
                          <SelectItem key={analytic.id} value={analytic.id}>
                            {analytic.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end justify-between gap-2 sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() =>
                        setLines((current) => current.filter((item) => item.key !== line.key))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="text-muted-foreground mt-2 flex justify-end gap-4 text-xs">
                  <span>
                    Subtotal <span className="tabular">{formatPreview(amounts.subtotal)}</span>
                  </span>
                  <span>
                    Tax <span className="tabular">{formatPreview(amounts.taxAmount)}</span>
                  </span>
                  <span className="text-foreground font-medium">
                    Total <span className="tabular">{formatPreview(amounts.total)}</span>
                  </span>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end border-t pt-3">
            <dl className="w-56 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Untaxed</dt>
                <dd className="tabular">{formatPreview(totals.untaxed)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular">{formatPreview(totals.tax)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatPreview(totals.total)}</dd>
              </div>
            </dl>
          </div>

          <p className="text-muted-foreground text-xs">
            Totals shown here are a preview. The server recalculates every amount as exact decimals
            before saving.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Field name="notes" label="Internal notes" error={error("notes")}>
            <Textarea
              {...fieldProps("notes", error("notes"))}
              defaultValue={initialValues?.notes ?? ""}
              rows={3}
              maxLength={2000}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
