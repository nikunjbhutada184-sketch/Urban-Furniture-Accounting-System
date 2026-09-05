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
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";

/**
 * Register a payment against a bill (money out) or an invoice (money in).
 *
 * Everything the mockup autofills is autofilled here: the direction follows
 * the document, the partner comes from it, the amount defaults to what is
 * still outstanding and the date to today. Payment Via defaults to a bank
 * journal, falling back to cash if that is all there is.
 *
 * None of that is trusted. The server enforces the real rules: never more than
 * is owed, the document must be posted, and an already-settled document is
 * refused -- which is what blocks a duplicate payment.
 */

export interface PaymentJournalOption {
  id: string;
  label: string;
  method: "CASH" | "BANK";
}

export function PaymentDialog({
  action,
  documentNumber,
  partnerName,
  amountResidual,
  journals,
  direction,
  triggerLabel = "Pay",
  triggerVariant = "default",
  title,
  currencyNote,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  documentNumber: string;
  /** The customer or vendor on the document. Shown read-only, as in the mockup. */
  partnerName: string;
  amountResidual: string;
  journals: PaymentJournalOption[];
  /** "receive" for a customer invoice, "send" for a vendor bill. */
  direction: "receive" | "send";
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  title: string;
  currencyNote: string;
}) {
  const router = useRouter();
  const [openRequested, setOpenRequested] = useState(false);
  const [state, formAction] = useActionState(action, IDLE_STATE);

  // Bank is the common case, so it is the default when the company has one.
  const defaultJournalId =
    journals.find((journal) => journal.method === "BANK")?.id ?? journals[0]?.id ?? "";
  const [journalId, setJournalId] = useState(defaultJournalId);

  const open = openRequested && state.status !== "success";

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  // The payment method follows the chosen journal: a cash journal pays cash.
  const method = journals.find((journal) => journal.id === journalId)?.method ?? "BANK";

  const cashJournals = journals.filter((journal) => journal.method === "CASH");
  const bankJournals = journals.filter((journal) => journal.method === "BANK");

  return (
    <AlertDialog open={open} onOpenChange={setOpenRequested}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          {triggerLabel}
        </Button>
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
          <input type="hidden" name="journalId" value={journalId} />

          <FormAlert state={state} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Payment Type</span>
              {/*
                Read-only on purpose: the direction is a property of the
                document, not a choice. Sending money against a customer
                invoice would be an accounting error, so the option is shown
                but cannot be picked.
              */}
              <div className="flex items-center gap-4 pt-1">
                {(["send", "receive"] as const).map((option) => (
                  <span
                    key={option}
                    className={cn(
                      "flex items-center gap-1.5 text-sm capitalize",
                      option === direction ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-3.5 items-center justify-center rounded-full border",
                        option === direction ? "border-primary" : "border-input",
                      )}
                    >
                      {option === direction ? (
                        <span className="bg-primary size-1.5 rounded-full" />
                      ) : null}
                    </span>
                    {option}
                  </span>
                ))}
              </div>
            </div>

            <Field name="paymentDate" label="Date" error={error("paymentDate")} required>
              <Input
                {...fieldProps("paymentDate", error("paymentDate"))}
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Partner</span>
              <p className="bg-secondary/60 truncate rounded-md border px-3 py-2 text-sm">
                {partnerName}
              </p>
              <p className="text-muted-foreground text-xs">Taken from {documentNumber}.</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium" id="payment-via-label">
                Payment Via
              </span>

              <div
                role="radiogroup"
                aria-labelledby="payment-via-label"
                className="border-input flex items-center rounded-md border p-0.5"
              >
                {[
                  { key: "BANK" as const, label: "Bank", options: bankJournals },
                  { key: "CASH" as const, label: "Cash", options: cashJournals },
                ].map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    role="radio"
                    aria-checked={method === group.key}
                    disabled={group.options.length === 0}
                    onClick={() => {
                      const first = group.options[0];
                      if (first) setJournalId(first.id);
                    }}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-sm transition-colors disabled:opacity-40",
                      method === group.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              {/*
                Several journals of the same kind is normal (two bank accounts,
                say), so the exact one is still selectable rather than guessed.
              */}
              {(method === "BANK" ? bankJournals : cashJournals).length > 1 ? (
                <select
                  aria-label="Journal"
                  value={journalId}
                  onChange={(event) => setJournalId(event.target.value)}
                  className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
                >
                  {(method === "BANK" ? bankJournals : cashJournals).map((journal) => (
                    <option key={journal.id} value={journal.id}>
                      {journal.label}
                    </option>
                  ))}
                </select>
              ) : null}

              {error("journalId") ? (
                <p role="alert" className="text-destructive text-xs">
                  {error("journalId")}
                </p>
              ) : null}
            </div>
          </div>

          <Field
            name="amount"
            label="Amount"
            error={error("amount")}
            hint="Defaults to the amount still due. The server refuses anything more."
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

          <Field name="reference" label="Reference" error={error("reference")}>
            <Input
              {...fieldProps("reference", error("reference"))}
              placeholder="Cheque or UTR number"
              maxLength={80}
            />
          </Field>

          <Field name="note" label="Note" error={error("note")}>
            <Textarea
              {...fieldProps("note", error("note"))}
              rows={2}
              maxLength={500}
              placeholder="Anything worth recording about this payment"
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenRequested(false)}>
              Cancel
            </Button>
            <SubmitButton label="Confirm" pendingLabel="Posting..." />
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
