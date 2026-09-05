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
 * Register a payment against a bill (money out) or an invoice (money in).
 *
 * The amount defaults to the outstanding balance. The server enforces the real
 * rules: never more than is owed, the document must be posted, and an
 * already-settled document is refused -- which is what blocks a duplicate
 * payment.
 */
export function PaymentDialog({
  action,
  documentNumber,
  amountResidual,
  journals,
  triggerLabel,
  title,
  currencyNote,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  documentNumber: string;
  amountResidual: string;
  journals: { id: string; label: string; method: "CASH" | "BANK" }[];
  triggerLabel: string;
  title: string;
  currencyNote: string;
}) {
  const router = useRouter();
  const [openRequested, setOpenRequested] = useState(false);
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [journalId, setJournalId] = useState(journals[0]?.id ?? "");

  const open = openRequested && state.status !== "success";

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  // The payment method follows the chosen journal: a cash journal pays cash.
  const method = journals.find((journal) => journal.id === journalId)?.method ?? "BANK";

  return (
    <AlertDialog open={open} onOpenChange={setOpenRequested}>
      <AlertDialogTrigger asChild>
        <Button size="sm">{triggerLabel}</Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {currencyNote} against {documentNumber}, and posts the matching journal entry.
            Outstanding:{" "}
            <span className="text-foreground tabular font-medium">{amountResidual}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="method" value={method} />

          <FormAlert state={state} />

          <Field
            name="journalId"
            label={triggerLabel.startsWith("Receive") ? "Receive into" : "Pay through"}
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
            <SubmitButton label={triggerLabel} />
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
