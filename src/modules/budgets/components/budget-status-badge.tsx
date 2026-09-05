import { type BudgetStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

const BUDGET_STATUS: Record<BudgetStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  CONFIRMED: { label: "Confirmed", variant: "success" },
  REVISED: { label: "Revised", variant: "warning" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  CLOSED: { label: "Closed", variant: "outline" },
};

export function BudgetStatusBadge({ status }: { status: BudgetStatus }) {
  const config = BUDGET_STATUS[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/** One-line explanation of what the current status means for the user. */
export function budgetStatusHint(status: BudgetStatus): string {
  switch (status) {
    case "DRAFT":
      return "Editable. Confirm it to lock the planned figures and start tracking progress.";
    case "CONFIRMED":
      return "Planned figures are locked. Create a revision to change them.";
    case "REVISED":
      return "Superseded by a newer revision. Read-only, kept for the planning history.";
    case "CANCELLED":
      return "Cancelled. Read-only.";
    case "CLOSED":
      return "The budget period has ended. Read-only.";
  }
}
