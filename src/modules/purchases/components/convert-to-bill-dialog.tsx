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
 * "Goods received - create the vendor bill."
 *
 * Collects the vendor's invoice date, due date and reference, then hands over
 * to the server, which refuses to bill an order that is still a draft,
 * cancelled, or already billed.
 */
export function ConvertToBillDialog({
  action,
  purchaseOrderId,
  purchaseOrderNumber,
  journals,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  journals: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [openRequested, setOpenRequested] = useState(false);
  const [state, formAction] = useActionState(action, IDLE_STATE);

  // Derived, not stored: a successful submit closes the dialog without an
  // effect having to write state back into it.
  const open = openRequested && state.status !== "success";

  useEffect(() => {
    if (state.status === "success") {
      router.push(state.id ? `/purchases/bills/${state.id}` : "/purchases/bills");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AlertDialog open={open} onOpenChange={setOpenRequested}>
      <AlertDialogTrigger asChild>
        <Button size="sm">Create vendor bill</Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create vendor bill</AlertDialogTitle>
          <AlertDialogDescription>
            Converts purchase order {purchaseOrderNumber} into a draft vendor bill. The bill only
            affects the ledger once you post it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />

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

          <Field
            name="vendorReference"
            label="Vendor invoice number"
            error={error("vendorReference")}
          >
            <Input
              {...fieldProps("vendorReference", error("vendorReference"))}
              placeholder="Their invoice reference"
              maxLength={80}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenRequested(false)}>
              Cancel
            </Button>
            <SubmitButton label="Create bill" />
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
