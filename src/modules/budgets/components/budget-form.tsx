"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";

export interface AnalyticOption {
  id: string;
  code: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

export interface BudgetLineDraft {
  key: string;
  analyticAccountId: string;
  plannedAmount: string;
}

export interface BudgetFormValues {
  name: string;
  periodStart: string;
  periodEnd: string;
  responsibleUserId: string;
  lines: BudgetLineDraft[];
}

let keyCounter = 0;
function newLine(): BudgetLineDraft {
  keyCounter += 1;
  return { key: `line-${keyCounter}`, analyticAccountId: "", plannedAmount: "0.00" };
}

/**
 * Budget editor, shared by "new budget" and "create revision".
 *
 * Only the planned amount is entered. Committed and achieved are derived from
 * confirmed orders and the posted ledger, so they are never editable here.
 */
export function BudgetForm({
  action,
  analyticAccounts,
  users,
  initialValues,
  submitLabel,
  cancelHref,
  successHref,
  /** A revision keeps the original's period and owner, so those fields are fixed. */
  lockHeader = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  analyticAccounts: AnalyticOption[];
  users: { id: string; name: string }[];
  initialValues?: Partial<BudgetFormValues>;
  submitLabel: string;
  cancelHref: string;
  successHref: string;
  lockHeader?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, IDLE_STATE);
  const [lines, setLines] = useState<BudgetLineDraft[]>(
    initialValues?.lines?.length ? initialValues.lines : [newLine()],
  );

  useEffect(() => {
    if (state.status === "success") {
      router.push(state.id ? `${successHref}/${state.id}` : successHref);
      router.refresh();
    }
  }, [state, router, successHref]);

  const error = (field: string) => state.fieldErrors?.[field];

  const analyticById = useMemo(
    () => new Map(analyticAccounts.map((analytic) => [analytic.id, analytic])),
    [analyticAccounts],
  );

  // Income and expense are planned separately -- summing them would be meaningless.
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const line of lines) {
      const amount = Number(line.plannedAmount) || 0;
      const type = analyticById.get(line.analyticAccountId)?.type;
      if (type === "INCOME") income += amount;
      else if (type === "EXPENSE") expense += amount;
    }

    return { income, expense };
  }, [lines, analyticById]);

  const usedAnalytics = new Set(lines.map((line) => line.analyticAccountId).filter(Boolean));

  function updateLine(key: string, patch: Partial<BudgetLineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          lines
            .filter((line) => line.analyticAccountId)
            .map((line) => ({
              analyticAccountId: line.analyticAccountId,
              accountId: "",
              plannedAmount: line.plannedAmount,
            })),
        )}
      />

      {!lockHeader ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field name="name" label="Budget name" error={error("name")} required>
                <Input
                  {...fieldProps("name", error("name"))}
                  defaultValue={initialValues?.name ?? ""}
                  placeholder="e.g. January 2026"
                  maxLength={160}
                  autoFocus
                  required
                />
              </Field>
            </div>

            <Field name="periodStart" label="Period start" error={error("periodStart")} required>
              <Input
                {...fieldProps("periodStart", error("periodStart"))}
                type="date"
                defaultValue={initialValues?.periodStart ?? ""}
                required
              />
            </Field>

            <Field name="periodEnd" label="Period end" error={error("periodEnd")} required>
              <Input
                {...fieldProps("periodEnd", error("periodEnd"))}
                type="date"
                defaultValue={initialValues?.periodEnd ?? ""}
                required
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                name="responsibleUserId"
                label="Responsible person"
                error={error("responsibleUserId")}
                hint="Who owns delivering this budget."
              >
                <Select
                  name="responsibleUserId"
                  defaultValue={initialValues?.responsibleUserId ?? "none"}
                >
                  <SelectTrigger id="responsibleUserId">
                    <SelectValue placeholder="Nobody assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nobody assigned</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Budget lines</CardTitle>
            <CardDescription>
              One line per analytic account. The type comes from the analytic account itself.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((current) => [...current, newLine()])}
          >
            <Plus aria-hidden />
            Add line
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {error("lines") ? (
            <p role="alert" className="text-destructive text-sm">
              {error("lines")}
            </p>
          ) : null}

          {lines.map((line, index) => {
            const analytic = analyticById.get(line.analyticAccountId);

            return (
              <div key={line.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Analytic account
                  </label>
                  <Select
                    value={line.analyticAccountId}
                    onValueChange={(value) => updateLine(line.key, { analyticAccountId: value })}
                  >
                    <SelectTrigger aria-label={`Analytic account for line ${index + 1}`}>
                      <SelectValue placeholder="Select a project or department" />
                    </SelectTrigger>
                    <SelectContent>
                      {analyticAccounts.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.id}
                          // Each analytic account may appear only once.
                          disabled={
                            usedAnalytics.has(option.id) && option.id !== line.analyticAccountId
                          }
                        >
                          {option.code} · {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end sm:col-span-2">
                  {analytic ? (
                    <Badge variant={analytic.type === "INCOME" ? "success" : "secondary"}>
                      {analytic.type === "INCOME" ? "Income" : "Expenses"}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">Type follows account</span>
                  )}
                </div>

                <div className="sm:col-span-3">
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Planned amount
                  </label>
                  <Input
                    value={line.plannedAmount}
                    onChange={(event) =>
                      updateLine(line.key, { plannedAmount: event.target.value })
                    }
                    inputMode="decimal"
                    className="tabular"
                    aria-label={`Planned amount for line ${index + 1}`}
                  />
                </div>

                <div className="flex items-end justify-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.key !== line.key))
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end gap-6 border-t pt-3 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground">Planned income</span>
              <span className="tabular font-medium">
                {totals.income.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground">Planned expenses</span>
              <span className="tabular font-medium">
                {totals.expense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
