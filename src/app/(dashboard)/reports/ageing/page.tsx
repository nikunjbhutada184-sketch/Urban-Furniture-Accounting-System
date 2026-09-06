import { type Metadata } from "next";
import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { type RawSearchParams } from "@/lib/list-params";
import { AgeingTable } from "@/modules/reporting/components/ageing-table";
import { ReportExportLinks } from "@/modules/reporting/components/report-export";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import { AGEING_BUCKETS, getAgeingReport } from "@/modules/reporting/partner-ledger-service";
import { parsePeriod } from "@/modules/reporting/report-service";
import { requireAccessScope, requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Ageing" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Customer and vendor ageing.
 *
 * "As at" is the period's end date, so the same period picker that drives every
 * other report drives this one too.
 */
export default async function AgeingPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const side = first(resolved.side) === "PAYABLE" ? "PAYABLE" : "RECEIVABLE";
  const isReceivable = side === "RECEIVABLE";

  // Scoped even here: the service is shared with the portal, and passing the
  // caller's own scope means this page can never widen it.
  const scope = await requireAccessScope();
  const report = await getAgeingReport({ side, asAt: period.to, scope });

  return (
    <ReportShell
      title={isReceivable ? "Customer Ageing" : "Vendor Ageing"}
      description={`Outstanding balances bucketed by how overdue they are, as at ${period.to
        .toISOString()
        .slice(0, 10)}.`}
      period={period}
      actions={
        <ReportExportLinks
          period={period}
          csvReport={isReceivable ? "customer-ageing" : "vendor-ageing"}
        />
      }
    >
      <div role="radiogroup" aria-label="Ageing side" className="flex gap-2">
        {[
          { value: "RECEIVABLE", label: "Customers" },
          { value: "PAYABLE", label: "Vendors" },
        ].map((option) => (
          <Link
            key={option.value}
            href={`/reports/ageing?side=${option.value}&from=${period.from
              .toISOString()
              .slice(0, 10)}&to=${period.to.toISOString().slice(0, 10)}`}
            role="radio"
            aria-checked={side === option.value}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              side === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total outstanding"
          value={report.grandTotal}
          tone="primary"
          hint={isReceivable ? "Owed by customers" : "Owed to vendors"}
        />
        {AGEING_BUCKETS.map((bucket) => (
          <StatCard key={bucket.key} label={bucket.label} value={report.totals[bucket.key]} />
        ))}
      </div>

      <div className="card-float rounded-xl border">
        <AgeingTable report={report} side={side} />
      </div>
    </ReportShell>
  );
}
