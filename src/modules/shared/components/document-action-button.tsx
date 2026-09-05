"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { type ActionState } from "@/modules/shared/action-state";

/**
 * A confirm-then-run button for document lifecycle actions (confirm, post,
 * cancel).
 *
 * Posting writes the ledger, so it always asks first and surfaces whatever the
 * server refuses -- an unbalanced entry, a locked period, a closed order --
 * rather than failing silently.
 */
export function DocumentActionButton({
  action,
  label,
  title,
  description,
  confirmLabel,
  variant = "default",
  disabled,
}: {
  action: () => Promise<ActionState>;
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: ButtonProps["variant"];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await action();

      if (result.status === "error") {
        setError(result.message ?? "The action could not be completed.");
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant={variant} size="sm" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {error ? (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          >
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              run();
            }}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {confirmLabel ?? label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
