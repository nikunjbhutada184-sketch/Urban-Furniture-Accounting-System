"use client";

import { type Journal, JournalType } from "@prisma/client";
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
import { JOURNAL_TYPE_OPTIONS } from "../schemas";

export function JournalForm({
  action,
  journal,
  accounts,
  paymentAccounts,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  journal?: Journal;
  accounts: { id: string; label: string }[];
  paymentAccounts: { id: string; label: string }[];
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [type, setType] = useState<string>(journal?.type ?? JournalType.SALES);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/journals");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const previous = (state.values ?? {}) as Record<string, string | undefined>;
  const needsPaymentAccount = type === JournalType.BANK || type === JournalType.CASH;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            name="code"
            label="Code"
            error={error("code")}
            hint="Short unique code, e.g. SAL."
            required
          >
            <Input
              {...fieldProps("code", error("code"))}
              defaultValue={previous.code ?? journal?.code ?? ""}
              placeholder="SAL"
              maxLength={12}
              autoFocus
              required
            />
          </Field>

          <Field name="name" label="Journal name" error={error("name")} required>
            <Input
              {...fieldProps("name", error("name"))}
              defaultValue={previous.name ?? journal?.name ?? ""}
              placeholder="Sales Journal"
              maxLength={120}
              required
            />
          </Field>

          <div className="sm:col-span-2">
            <Field name="type" label="Type" error={error("type")} required>
              <Select name="type" value={type} onValueChange={setType}>
                <SelectTrigger id="type" aria-invalid={error("type") ? true : undefined}>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {JOURNAL_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default accounts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {needsPaymentAccount ? (
            <div className="sm:col-span-2">
              <Field
                name="paymentAccountId"
                label="Payment account"
                error={error("paymentAccountId")}
                hint="The cash or bank account money actually moves through."
                required
              >
                <Select
                  name="paymentAccountId"
                  defaultValue={previous.paymentAccountId ?? journal?.paymentAccountId ?? "none"}
                >
                  <SelectTrigger
                    id="paymentAccountId"
                    aria-invalid={error("paymentAccountId") ? true : undefined}
                  >
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {paymentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}

          <Field
            name="defaultDebitAccountId"
            label="Default debit account"
            error={error("defaultDebitAccountId")}
          >
            <Select
              name="defaultDebitAccountId"
              defaultValue={
                previous.defaultDebitAccountId ?? journal?.defaultDebitAccountId ?? "none"
              }
            >
              <SelectTrigger id="defaultDebitAccountId">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            name="defaultCreditAccountId"
            label="Default credit account"
            error={error("defaultCreditAccountId")}
          >
            <Select
              name="defaultCreditAccountId"
              defaultValue={
                previous.defaultCreditAccountId ?? journal?.defaultCreditAccountId ?? "none"
              }
            >
              <SelectTrigger id="defaultCreditAccountId">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.label}
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
          <Link href="/journals">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
