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
import { IDLE_STATE } from "@/modules/shared/action-state";
import { payOwnInvoiceAction } from "@/modules/portal/actions";

/**
 * A customer paying their own invoice.
 *
 * The form carries only the invoice, the amount and a reference. Whose account
 * it settles, which direction the money moves and which journal it posts to are
 * all decided server-side from the session — nothing here can influence them.
 */
export function PayInvoiceDialog({
  invoiceId,
  invoiceNumber,
  amountResidual,
}: {
  invoiceId: string;
  invoiceNumber: string;
  amountResidual: string;
}) {
  const router = useRouter();
  const [openRequested, setOpenRequested] = useState(false);
  const [state, formAction] = useActionState(payOwnInvoiceAction, IDLE_STATE);

  const open = openRequested && state.status !== "success";

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <AlertDialog open={open} onOpenChange={setOpenRequested}>
      <AlertDialogTrigger asChild>
        <Button size="sm">Pay now</Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pay {invoiceNumber}</AlertDialogTitle>
          <AlertDialogDescription>
            Records your payment against this invoice. Outstanding:{" "}
            <span className="text-foreground tabular font-medium">{amountResidual}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <FormAlert state={state} />

          <Field
            name="amount"
            label="Amount"
            error={error("amount")}
            hint="You can pay part of the invoice. Never more than is outstanding."
            required
          >
            <Input
              {...fieldProps("amount", error("amount"))}
              defaultValue={amountResidual}
              inputMode="decimal"
              className="tabular"
              required
            />
          </Field>

          <Field name="paymentDate" label="Date" error={error("paymentDate")} required>
            <Input
              {...fieldProps("paymentDate", error("paymentDate"))}
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </Field>

          <Field name="reference" label="Reference" error={error("reference")}>
            <Input
              {...fieldProps("reference", error("reference"))}
              placeholder="Your transfer or cheque reference"
              maxLength={80}
            />
          </Field>

          <p className="text-muted-foreground text-xs">
            This records the payment against your account. No card details are collected here.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenRequested(false)}>
              Cancel
            </Button>
            <SubmitButton label="Confirm payment" pendingLabel="Recording..." />
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
