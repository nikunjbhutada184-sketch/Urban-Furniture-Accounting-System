import { PageHeader } from "@/components/page-header";
import { type ReportPeriod } from "@/modules/reporting/report-service";
import { PeriodPicker } from "./period-picker";

/**
 * Common frame for every report: title, description, and the period selector.
 * Keeps the reports visually consistent and the terminology identical.
 */
export function ReportShell({
  title,
  description,
  period,
  children,
  actions,
}: {
  title: string;
  description: string;
  period: ReportPeriod;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={title} description={description}>
        {actions}
      </PageHeader>

      <PeriodPicker
        from={period.from.toISOString().slice(0, 10)}
        to={period.to.toISOString().slice(0, 10)}
      />

      {children}
    </div>
  );
}

/** A balanced/unbalanced banner, used where an equation must hold. */
export function ReconciliationBanner({
  isBalanced,
  balancedLabel,
  unbalancedLabel,
  difference,
}: {
  isBalanced: boolean;
  balancedLabel: string;
  unbalancedLabel: string;
  difference: string;
}) {
  if (isBalanced) {
    return (
      <p className="border-success/30 bg-success/10 text-success rounded-lg border p-3 text-sm">
        {balancedLabel}
      </p>
    );
  }

  return (
    <p
      role="alert"
      className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
    >
      {unbalancedLabel} Difference: <span className="tabular font-medium">{difference}</span>.
    </p>
  );
}
