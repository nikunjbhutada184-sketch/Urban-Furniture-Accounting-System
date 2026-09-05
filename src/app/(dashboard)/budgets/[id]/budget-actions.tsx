"use client";

import { useTransition } from "react";
import { confirmBudgetAction, cancelBudgetAction, syncBudgetAction } from "@/modules/budgets/actions";
import { Button } from "@/components/ui/button";
import { Check, XCircle, RefreshCw, FileEdit } from "lucide-react";
import { useRouter } from "next/navigation";
import { BudgetStatus } from "@prisma/client";

export function BudgetActions({ budgetId, status }: { budgetId: string, status: BudgetStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      await confirmBudgetAction({ id: budgetId });
    });
  };

  const handleCancel = () => {
    if (!confirm("Are you sure you want to cancel this budget?")) return;
    startTransition(async () => {
      await cancelBudgetAction({ id: budgetId });
    });
  };

  const handleSync = () => {
    startTransition(async () => {
      await syncBudgetAction({ id: budgetId });
    });
  };

  const handleRevise = () => {
    // Navigates to a special revision page or we can handle it via dialog.
    // For simplicity, we just trigger the route.
    router.push(`/budgets/${budgetId}/revise`);
  };

  return (
    <div className="flex items-center space-x-2">
      {status === BudgetStatus.CONFIRMED && (
        <>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isPending} className="text-blue-600 border-blue-200 hover:bg-blue-50">
            <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} /> Sync Actuals
          </Button>
          <Button variant="outline" size="sm" onClick={handleRevise} disabled={isPending} className="text-amber-600 border-amber-200 hover:bg-amber-50">
            <FileEdit className="h-4 w-4 mr-2" /> Revise
          </Button>
        </>
      )}

      {status === BudgetStatus.DRAFT && (
        <Button variant="outline" size="sm" onClick={handleConfirm} disabled={isPending} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
          <Check className="h-4 w-4 mr-2" /> Confirm
        </Button>
      )}

      {(status === BudgetStatus.DRAFT || status === BudgetStatus.CONFIRMED) && (
        <Button variant="outline" size="sm" onClick={handleCancel} disabled={isPending} className="text-rose-600 border-rose-200 hover:bg-rose-50">
          <XCircle className="h-4 w-4 mr-2" /> Cancel
        </Button>
      )}
    </div>
  );
}
