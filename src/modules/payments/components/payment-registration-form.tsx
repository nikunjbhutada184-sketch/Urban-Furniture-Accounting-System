"use client";

import { PaymentDirection } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { registerPaymentAction } from "@/modules/payments/actions";
import { IDLE_STATE } from "@/modules/shared/action-state";

export interface OpenDocumentOption {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  total: string;
  residual: string;
}

/**
 * Register one payment against any number of a contact's open documents.
 *
 * Direction and contact live in the URL, so the server can load that contact's
 * open documents and render them here — there is no client-side fetch layer,
 * and the residual beside each row is the real one from the database.
 *
 * The arithmetic on this screen is presentational only: it adds up what the
 * user has typed so they can see whether it matches the payment. Every figure
 * is re-derived and re-checked server-side before anything is posted.
 */
export function PaymentRegistrationForm({
  direction,
  contactId,
  contactName,
  journals,
  documents,
}: {
  direction: PaymentDirection;
  contactId: string;
  contactName: string;
  journals: { id: string; label: string; method: "CASH" | "BANK" }[];
  documents: OpenDocumentOption[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(registerPaymentAction, IDLE_STATE);

  const isInbound = direction === PaymentDirection.INBOUND;
  const defaultJournalId =
    journals.find((journal) => journal.method === "BANK")?.id ?? journals[0]?.id ?? "";

  const [journalId, setJournalId] = useState(defaultJournalId);
  const [amount, setAmount] = useState("");
  const [allocated, setAllocated] = useState<Record<string, string>>({});

  useEffect(() => {
    if (state.status === "success") {
      router.push("/payments");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];

  const allocatedTotal = useMemo(
    () =>
      Object.values(allocated).reduce((sum, value) => {
        const parsed = Number(value);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0),
    [allocated],
  );

  const paymentAmount = Number(amount);
  const remainder =
    Number.isFinite(paymentAmount) && amount.trim() !== "" ? paymentAmount - allocatedTotal : 0;
  const overAllocated = remainder < -0.005;

  /** Fills the rows top-down from the amount entered, oldest document first. */
  function autoAllocate() {
    let left = Number.isFinite(paymentAmount) ? paymentAmount : 0;
    const next: Record<string, string> = {};

    for (const document of documents) {
      if (left <= 0) break;
      const residual = Number(document.residual);
      const apply = Math.min(left, residual);
      if (apply <= 0) continue;

      next[document.id] = apply.toFixed(2);
      left -= apply;
    }

    setAllocated(next);
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="journalId" value={journalId} />

      {documents.map((document, index) => (
        <div key={document.id}>
          <input type="hidden" name={`allocations.${index}.documentId`} value={document.id} />
          <input
            type="hidden"
            name={`allocations.${index}.amount`}
            value={allocated[document.id] ?? ""}
          />
        </div>
      ))}

      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isInbound ? "Receipt from" : "Payment to"} {contactName}
          </CardTitle>
          <CardDescription>
            {isInbound
              ? "Money received. Posts Dr cash or bank, Cr debtors."
              : "Money paid out. Posts Dr creditors, Cr cash or bank."}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="amount" label="Amount" error={error("amount")} required>
            <Input
              {...fieldProps("amount", error("amount"))}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
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

          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium" id="via-label">
              {isInbound ? "Receive into" : "Pay through"}
            </span>

            <div role="radiogroup" aria-labelledby="via-label" className="flex flex-wrap gap-2">
              {journals.map((journal) => (
                <button
                  key={journal.id}
                  type="button"
                  role="radio"
                  aria-checked={journalId === journal.id}
                  onClick={() => setJournalId(journal.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    journalId === journal.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {journal.label}
                </button>
              ))}
            </div>

            {error("journalId") ? (
              <p role="alert" className="text-destructive text-xs">
                {error("journalId")}
              </p>
            ) : null}
          </div>

          <Field name="reference" label="Reference" error={error("reference")}>
            <Input
              {...fieldProps("reference", error("reference"))}
              placeholder="Cheque or UTR number"
              maxLength={80}
            />
          </Field>

          <Field name="note" label="Note" error={error("note")}>
            <Textarea {...fieldProps("note", error("note"))} rows={1} maxLength={500} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Allocate to open documents</CardTitle>
            <CardDescription>
              Anything left unallocated is held on the payment as an advance.
            </CardDescription>
          </div>

          {documents.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={autoAllocate}>
              Auto-allocate
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="p-0">
          {documents.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">
              {contactName} has no open {isInbound ? "invoices" : "bills"}. You can still record the
              payment — it will be held as an advance on their account.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isInbound ? "Invoice" : "Bill"}</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-40 text-right">Allocate</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">{document.number}</TableCell>
                    <TableCell className="text-muted-foreground tabular text-xs">
                      {document.date}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular text-xs">
                      {document.dueDate ?? "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">{document.total}</TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {document.residual}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Amount to allocate to ${document.number}`}
                        value={allocated[document.id] ?? ""}
                        onChange={(event) =>
                          setAllocated((current) => ({
                            ...current,
                            [document.id]: event.target.value,
                          }))
                        }
                        inputMode="decimal"
                        placeholder="0.00"
                        className="tabular text-right"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
            <div className="text-right">
              <div className="text-muted-foreground text-xs">Allocated</div>
              <div className="tabular font-medium">{allocatedTotal.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground text-xs">
                {overAllocated ? "Over-allocated by" : "Unallocated"}
              </div>
              <div className={cn("tabular font-medium", overAllocated && "text-destructive")}>
                {Math.abs(remainder).toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {overAllocated ? (
        <p role="alert" className="text-destructive text-sm">
          The allocated total is more than the payment amount. Reduce a line, or increase the
          amount.
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <SubmitButton label="Register payment" pendingLabel="Posting..." />
        <Button type="button" variant="ghost" asChild>
          <Link href="/payments">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
