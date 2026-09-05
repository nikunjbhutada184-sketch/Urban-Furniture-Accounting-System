"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type ActionState } from "@/modules/shared/action-state";

/**
 * Form building blocks shared by every module's form.
 *
 * They render the error state produced by a server action, so validation
 * messages look and behave the same everywhere and always come from the
 * server's Zod schema rather than a re-implemented client rule.
 */

export function Field({
  name,
  label,
  error,
  hint,
  required,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {required ? (
          <span className="text-destructive ml-0.5" aria-hidden>
            *
          </span>
        ) : null}
      </Label>

      {children}

      {hint && !error ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Props to spread onto the input inside a `Field`, wiring up ARIA. */
export function fieldProps(name: string, error?: string) {
  return {
    id: name,
    name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${name}-error` : undefined,
  } as const;
}

export function FormAlert({ state }: { state: ActionState }) {
  if (state.status === "error" && state.message) {
    return (
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{state.message}</span>
      </div>
    );
  }

  if (state.status === "success" && state.message) {
    return (
      <div
        role="status"
        className="border-success/30 bg-success/10 text-success flex items-start gap-2 rounded-md border p-3 text-sm"
      >
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{state.message}</span>
      </div>
    );
  }

  return null;
}

export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {pendingLabel ?? `${label}...`}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
