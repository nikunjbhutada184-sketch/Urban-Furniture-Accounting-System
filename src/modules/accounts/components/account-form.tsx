"use client";

import { AccountKind, type LedgerAccount } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
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
import { ACCOUNT_KIND_OPTIONS, ACCOUNT_TYPE_OPTIONS } from "../schemas";

export function AccountForm({
  action,
  account,
  parentOptions,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  account?: LedgerAccount;
  parentOptions: { id: string; label: string }[];
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, IDLE_STATE);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/accounts");
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
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            name="code"
            label="Account code"
            error={error("code")}
            hint="Unique. Also the sort order in reports, e.g. 1010."
            required
          >
            <Input
              {...fieldProps("code", error("code"))}
              defaultValue={previous.code ?? account?.code ?? ""}
              placeholder="1010"
              maxLength={24}
              autoFocus
              required
            />
          </Field>

          <Field name="name" label="Account name" error={error("name")} required>
            <Input
              {...fieldProps("name", error("name"))}
              defaultValue={previous.name ?? account?.name ?? ""}
              placeholder="Cash"
              maxLength={160}
              required
            />
          </Field>

          <Field
            name="type"
            label="Type"
            error={error("type")}
            hint="Asset, Liability and Capital appear on the Balance Sheet; Income and Expense on the P&L."
            required
          >
            <Select name="type" defaultValue={previous.type ?? account?.type ?? "ASSET"}>
              <SelectTrigger id="type" aria-invalid={error("type") ? true : undefined}>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            name="kind"
            label="Role"
            error={error("kind")}
            hint="How automation finds this account (receivable, bank, tax...)."
          >
            <Select name="kind" defaultValue={previous.kind ?? account?.kind ?? AccountKind.OTHER}>
              <SelectTrigger id="kind">
                <SelectValue placeholder="Other" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            name="parentId"
            label="Parent account"
            error={error("parentId")}
            hint="Optional. Used to group accounts in reports."
          >
            <Select name="parentId" defaultValue={previous.parentId ?? account?.parentId ?? "none"}>
              <SelectTrigger id="parentId">
                <SelectValue placeholder="No parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No parent</SelectItem>
                {parentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isReconcilable"
                defaultChecked={account?.isReconcilable ?? false}
                className="border-input size-4 rounded border"
              />
              Reconcilable (settled by payments)
            </label>
          </div>

          <div className="sm:col-span-2">
            <Field name="description" label="Description" error={error("description")}>
              <Textarea
                {...fieldProps("description", error("description"))}
                defaultValue={previous.description ?? account?.description ?? ""}
                maxLength={400}
                rows={3}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Button type="button" variant="ghost" asChild>
          <Link href="/accounts">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
