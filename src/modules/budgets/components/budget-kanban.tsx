import { KanbanCard, KanbanField, KanbanGrid } from "@/components/data-table/kanban";
import { type BudgetListRow } from "@/modules/budgets/budget-service";
import { BudgetPieWithLegend } from "@/modules/budgets/components/budget-pie";
import { BudgetStatusBadge } from "@/modules/budgets/components/budget-status-badge";

/**
 * Budget kanban view: the same rows as the list, as cards.
 *
 * Each card carries the period, the status and the achieved/balance donut, and
 * opens the budget's form view on click.
 */
export function BudgetKanban({ rows }: { rows: BudgetListRow[] }) {
  return (
    <KanbanGrid>
      {rows.map((budget) => (
        <KanbanCard key={budget.id} href={`/budgets/${budget.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{budget.name}</p>
              <p className="text-muted-foreground tabular mt-0.5 text-xs">
                {budget.periodStart.toISOString().slice(0, 10)} to{" "}
                {budget.periodEnd.toISOString().slice(0, 10)}
              </p>
            </div>
            <BudgetStatusBadge status={budget.status} />
          </div>

          <div className="mt-3">
            <BudgetPieWithLegend achieved={budget.achieved} toAchieve={budget.toAchieve} />
          </div>

          <div className="mt-3 space-y-0.5 border-t pt-3">
            <KanbanField label="Planned" value={budget.planned} tabular />
            <KanbanField label="Committed" value={budget.committed} tabular />
            <KanbanField
              label="Achieved %"
              value={budget.achievedPercent === null ? "—" : `${budget.achievedPercent}%`}
              tabular
            />
            <KanbanField label="Responsible" value={budget.responsibleName ?? "—"} />
          </div>

          {budget.revisionOfName ? (
            <p className="text-muted-foreground mt-2 text-xs">
              revision of {budget.revisionOfName}
            </p>
          ) : null}
        </KanbanCard>
      ))}
    </KanbanGrid>
  );
}
