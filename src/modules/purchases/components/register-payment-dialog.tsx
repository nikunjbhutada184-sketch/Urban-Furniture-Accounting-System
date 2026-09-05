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
 * Register a payment against a vendor bill.
 *
 * The amount defaults to the outstanding balance. The server enforces the real
 * rule: a payment may never exceed what is still owed, and the bill must be
 * posted and not already settled.
 */
export function RegisterPaymentDialog({
  action,
  billNumber,
  amountResidual,
  journals,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  billNumber: string;
  amountResidual: string;
  journals: { id: string; label: string; method: "CASH" | "BANK" }[];
}) {
  const router = useRouter();
  const [openRequested, setOpenRequested] = useState(false);
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [journalId, setJournalId] = useState(journals[0]?.id ?? "");

  // Derived, not stored: a successful submit closes the dialog.
  const open = openRequested && state.status !== "success";

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const method = journals.find((journal) => journal.id === journalId)?.method ?? "BANK";

  return (
    <AlertDialog open={open} onOpenChange={setOpenRequested}>
      <AlertDialogTrigger asChild>
        <Button size="sm">Register payment</Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Register payment</AlertDialogTitle>
          <AlertDialogDescription>
            Records a payment against bill {billNumber} and posts the matching journal entry.
            Outstanding:{" "}
            <span className="text-foreground tabular font-medium">{amountResidual}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="space-y-4" noValidate>
          {/* The method follows the chosen journal: a cash journal pays cash. */}
          <input type="hidden" name="method" value={method} />

          <FormAlert state={state} />

          <Field
            name="journalId"
            label="Pay through"
            error={error("journalId")}
            hint="Choose the cash or bank journal the money moves through."
            required
          >
            <Select name="journalId" value={journalId} onValueChange={setJournalId}>
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
            <Field name="amount" label="Amount" error={error("amount")} required>
              <Input
                {...fieldProps("amount", error("amount"))}
                defaultValue={amountResidual}
                inputMode="decimal"
                className="tabular"
                required
              />
            </Field>

            <Field name="paymentDate" label="Payment date" error={error("paymentDate")} required>
              <Input
                {...fieldProps("paymentDate", error("paymentDate"))}
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
          </div>

          <Field name="reference" label="Reference" error={error("reference")}>
            <Input
              {...fieldProps("reference", error("reference"))}
              placeholder="Cheque or UTR number"
              maxLength={80}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenRequested(false)}>
              Cancel
            </Button>
            <SubmitButton label="Register payment" />
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
