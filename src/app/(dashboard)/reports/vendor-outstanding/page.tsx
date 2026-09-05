import { type Metadata } from "next";
import { StatCard } from "@/components/ui/stat-card";
import { type RawSearchParams } from "@/lib/list-params";
import { OutstandingTable } from "@/modules/reporting/components/outstanding-table";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import { getVendorOutstandingReport, parsePeriod } from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Vendor Outstanding" };

export default async function VendorOutstandingReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const report = await getVendorOutstandingReport(period);
  const vendors = new Set(report.rows.map((row) => row.contactId)).size;

  return (
    <ReportShell
      title="Vendor Outstanding"
      description={`Unpaid vendor bills as at ${period.to.toISOString().slice(0, 10)}.`}
      period={period}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total outstanding" value={report.totalOutstanding} tone="primary" />
        <StatCard label="Overdue" value={report.totalOverdue} hint="Past the due date" />
        <StatCard
          label="Vendors owed"
          value={String(vendors)}
          hint={`${report.rows.length} open bill${report.rows.length === 1 ? "" : "s"}`}
        />
      </div>

      <OutstandingTable
        report={report}
        partyLabel="Vendor"
        documentLabel="Bill"
        documentHrefPrefix="/purchases/bills"
        emptyTitle="Nothing outstanding"
        emptyDescription="Every posted vendor bill has been paid in full."
        emptyAction={{ label: "View bills", href: "/purchases/bills" }}
      />
    </ReportShell>
  );
}
