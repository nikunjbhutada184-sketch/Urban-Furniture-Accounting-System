"use client";

import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { type ActionState } from "@/modules/shared/action-state";

/**
 * Confirmation dialog for archiving / restoring a record.
 *
 * Master data is never hard-deleted: records referenced by accounting history
 * must remain resolvable forever. The service still re-checks the rules --
 * this dialog only asks the question.
 */
export function ArchiveDialog({
  action,
  recordName,
  entityLabel,
  isArchived,
  size = "sm",
}: {
  /** A server action already bound to the record's id. */
  action: () => Promise<ActionState>;
  recordName: string;
  entityLabel: string;
  isArchived: boolean;
  size?: "sm" | "default" | "icon";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
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

  const verb = isArchived ? "Restore" : "Archive";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size={size} aria-label={`${verb} ${recordName}`}>
          {isArchived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {size === "icon" ? null : verb}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {verb} {entityLabel.toLowerCase()}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isArchived ? (
              <>
                <span className="text-foreground font-medium">{recordName}</span> will become
                selectable again on new documents.
              </>
            ) : (
              <>
                <span className="text-foreground font-medium">{recordName}</span> will be hidden
                from new documents. Existing accounting history is unaffected — archiving never
                deletes anything, and the record stays visible on past transactions.
              </>
            )}
          </AlertDialogDescription>
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
              confirm();
            }}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {verb}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
