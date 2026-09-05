"use client";

import { type AnalyticAccount } from "@prisma/client";
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
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";
import { ANALYTIC_TYPE_OPTIONS } from "../schemas";

export function AnalyticForm({
  action,
  account,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  account?: AnalyticAccount;
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, IDLE_STATE);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/analytic");
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
          <CardTitle className="text-base">Analytic account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="code" label="Code" error={error("code")} hint="Unique." required>
            <Input
              {...fieldProps("code", error("code"))}
              defaultValue={previous.code ?? account?.code ?? ""}
              placeholder="AA-RETAIL"
              maxLength={24}
              autoFocus
              required
            />
          </Field>

          <Field
            name="type"
            label="Type"
            error={error("type")}
            hint="Whether this tracks income or expenses."
            required
          >
            <Select name="type" defaultValue={previous.type ?? account?.type ?? "INCOME"}>
              <SelectTrigger id="type" aria-invalid={error("type") ? true : undefined}>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {ANALYTIC_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field name="name" label="Analytic account name" error={error("name")} required>
              <Input
                {...fieldProps("name", error("name"))}
                defaultValue={previous.name ?? account?.name ?? ""}
                placeholder="Retail Showroom"
                maxLength={160}
                required
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Button type="button" variant="ghost" asChild>
          <Link href="/analytic">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
