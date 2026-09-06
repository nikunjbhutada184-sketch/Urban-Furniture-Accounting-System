import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { Amount } from "@/components/ui/amount";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams } from "@/lib/list-params";
import { ReportExportLinks } from "@/modules/reporting/components/report-export";
import { ReconciliationBanner, ReportShell } from "@/modules/reporting/components/report-shell";
import { getTrialBalanceReport, parsePeriod } from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Trial Balance" };

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const report = await getTrialBalanceReport(period);

  return (
    <ReportShell
      title="Trial Balance"
      description="Debit and credit movement per account. The two columns must agree."
      period={period}
      actions={<ReportExportLinks period={period} csvReport="trial-balance" />}
    >
      <ReconciliationBanner
        isBalanced={report.isBalanced}
        balancedLabel="The ledger balances: total debits equal total credits."
        unbalancedLabel="The ledger does not balance, which should be impossible through the posting engine."
        difference={report.difference}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total debits" value={report.totalDebit} />
        <StatCard label="Total credits" value={report.totalCredit} />
        <StatCard
          label="Difference"
          value={report.difference}
          hint={report.isBalanced ? "Balanced" : "Investigate immediately"}
        />
      </div>

      <div className="card-float rounded-xl border">
        {report.rows.length === 0 ? (
          <EmptyState
            title="Nothing posted in this period"
            description="Post a bill, invoice or journal entry, then come back."
            action={{ label: "Journal entries", href: "/journal-entries" }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell className="tabular font-medium">{row.code}</TableCell>
                  <TableCell>
                    <Link
                      href={`/general-ledger?account=${row.accountId}&from=${period.from.toISOString().slice(0, 10)}&to=${period.to.toISOString().slice(0, 10)}`}
                      className="hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{row.type}</TableCell>
                  <TableCell className="text-right">
                    {row.debit === "0.00" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Amount value={row.debit} size="sm" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.credit === "0.00" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Amount value={row.credit} size="sm" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">
                  <Amount value={report.totalDebit} size="sm" />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={report.totalCredit} size="sm" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </ReportShell>
  );
}
