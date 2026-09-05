"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";

/**
 * Converts a confirmed order into its billing document:
 * purchase order -> vendor bill, or sales order -> customer invoice.
 *
 * Both flows collect the same things (journal, invoice date, due date,
 * reference), so they share this dialog. The server does the real gate-keeping:
 * it refuses an order that is still a draft, cancelled, or already converted --
 * which is what prevents a duplicate bill or invoice.
 */
export function ConvertDocumentDialog({
  action,
  orderId,
  orderNumber,
  journals,
  triggerLabel,
  title,
  description,
  /** Form field the server expects: "purchaseOrderId" or "salesOrderId". */
  orderFieldName,
  /** Where the created document lives, e.g. "/sales/invoices". */
  successHref,
  referenceLabel,
  referencePlaceholder,
  referenceFieldName = "reference",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  orderId: string;
  orderNumber: string;
  journals: { id: string; label: string }[];
  triggerLabel: string;
  title: string;
  description: string;
  orderFieldName: string;
  successHref: string;
  referenceLabel: string;
  referencePlaceholder?: string;
  referenceFieldName?: string;
}) {
  const router = useRouter();
  const [openRequested, setOpenRequested] = useState(false);
  const [state, formAction] = useActionState(action, IDLE_STATE);

  // Derived, not stored: a successful submit closes the dialog without an
  // effect writing state back into it.
  const open = openRequested && state.status !== "success";

  useEffect(() => {
    if (state.status === "success") {
      router.push(state.id ? `${successHref}/${state.id}` : successHref);
      router.refresh();
    }
  }, [state, router, successHref]);

  const error = (field: string) => state.fieldErrors?.[field];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AlertDialog open={open} onOpenChange={setOpenRequested}>
      <AlertDialogTrigger asChild>
        <Button size="sm">{triggerLabel}</Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description} Converting {orderNumber} creates a draft — it only affects the ledger once
            you post it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name={orderFieldName} value={orderId} />

          <FormAlert state={state} />

          <Field name="journalId" label="Journal" error={error("journalId")} required>
            <Select name="journalId" defaultValue={journals[0]?.id ?? ""}>
              <SelectTrigger id="journalId">
                <SelectValue placeholder="Select a journal" />
              </SelectTrigger>
              <SelectContent>
                {journals.map((journal) => (
                  <SelectItem key={journal.id} value={journal.id}>
                    {journal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="invoiceDate" label="Invoice date" error={error("invoiceDate")} required>
              <Input
                {...fieldProps("invoiceDate", error("invoiceDate"))}
                type="date"
                defaultValue={today}
                required
              />
            </Field>

            <Field name="dueDate" label="Due date" error={error("dueDate")}>
              <Input {...fieldProps("dueDate", error("dueDate"))} type="date" />
            </Field>
          </div>

          <Field name={referenceFieldName} label={referenceLabel} error={error(referenceFieldName)}>
            <Input
              {...fieldProps(referenceFieldName, error(referenceFieldName))}
              placeholder={referencePlaceholder}
              maxLength={80}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenRequested(false)}>
              Cancel
            </Button>
            <SubmitButton label={triggerLabel} />
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
