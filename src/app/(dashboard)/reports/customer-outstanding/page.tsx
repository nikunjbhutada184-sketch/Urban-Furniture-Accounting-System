import { type Metadata } from "next";
import { StatCard } from "@/components/ui/stat-card";
import { type RawSearchParams } from "@/lib/list-params";
import { OutstandingTable } from "@/modules/reporting/components/outstanding-table";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import { getCustomerOutstandingReport, parsePeriod } from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Customer Outstanding" };

export default async function CustomerOutstandingReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const report = await getCustomerOutstandingReport(period);
  const customers = new Set(report.rows.map((row) => row.contactId)).size;

  return (
    <ReportShell
      title="Customer Outstanding"
      description={`Unpaid customer invoices as at ${period.to.toISOString().slice(0, 10)}.`}
      period={period}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total outstanding" value={report.totalOutstanding} tone="primary" />
        <StatCard label="Overdue" value={report.totalOverdue} hint="Past the due date" />
        <StatCard
          label="Customers owing"
          value={String(customers)}
          hint={`${report.rows.length} open invoice${report.rows.length === 1 ? "" : "s"}`}
        />
      </div>

      <OutstandingTable
        report={report}
        partyLabel="Customer"
        documentLabel="Invoice"
        documentHrefPrefix="/sales/invoices"
        emptyTitle="Nothing outstanding"
        emptyDescription="Every posted customer invoice has been paid in full."
        emptyAction={{ label: "View invoices", href: "/sales/invoices" }}
      />
    </ReportShell>
  );
}
