import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListPagination } from "@/components/data-table/list-pagination";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams, buildPageMeta, parseListParams } from "@/lib/list-params";
import { BudgetPie } from "@/modules/budgets/components/budget-pie";
import { ReportExportLinks } from "@/modules/reporting/components/report-export";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import { getBudgetReport, parsePeriod } from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Budget Report" };

/** A quiet progress bar; the number beside it carries the value. */
function AchievementBar({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-muted-foreground">—</span>;

  const clamped = Math.max(0, Math.min(percent, 100));

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${clamped}%` }}
          aria-hidden
        />
      </div>
      <span className="tabular w-12 text-right text-sm font-medium">{percent}%</span>
    </div>
  );
}

export default async function BudgetReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("budget:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  // Every budget line is summarised here AND drawn as a donut, so the totals
  // are computed over the whole report while only one page is rendered.
  // The CSV export is deliberately unpaged — that is what it is for.
  const allRows = await getBudgetReport(period);

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: ["budget"] as const,
    defaultSort: "budget",
  });

  const meta = buildPageMeta(params, allRows.length);
  const rows = allRows.slice((meta.page - 1) * meta.perPage, meta.page * meta.perPage);

  const totals = allRows.reduce(
    (accumulator, row) => ({
      planned: accumulator.planned + Number(row.planned),
      committed: accumulator.committed + Number(row.committed),
      achieved: accumulator.achieved + Number(row.achieved),
    }),
    { planned: 0, committed: 0, achieved: 0 },
  );

  const format = (value: number) => value.toFixed(2);

  return (
    <ReportShell
      title="Budget Report"
      description="Planned against committed and achieved, for every budget overlapping the period."
      period={period}
      actions={
        <>
          <ReportExportLinks period={period} csvReport="budget" />
          <Link href="/budgets" className="text-muted-foreground text-sm hover:underline">
            Manage budgets
          </Link>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Planned" value={format(totals.planned)} />
        <StatCard
          label="Committed"
          value={format(totals.committed)}
          hint="Confirmed, not yet posted"
        />
        <StatCard
          label="Achieved"
          value={format(totals.achieved)}
          tone="primary"
          hint="From the posted ledger"
        />
        <StatCard
          label="To achieve"
          value={format(Math.max(totals.planned - totals.achieved, 0))}
        />
      </div>

      <div className="card-float rounded-xl border">
        {allRows.length === 0 ? (
          <EmptyState
            title="No budgets in this period"
            description="Create a budget whose period overlaps this range, then confirm it to start tracking."
            action={{ label: "New budget", href: "/budgets/new" }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Budget</TableHead>
                <TableHead>Analytic</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Committed Amount</TableHead>
                <TableHead className="text-right">Achieved Amount</TableHead>
                <TableHead className="text-right">Achieved %</TableHead>
                <TableHead className="text-right">Amount To Achieve</TableHead>
                <TableHead className="text-center">Pie Chart</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.lineId}>
                  <TableCell>
                    <Link href={`/budgets/${row.budgetId}`} className="font-medium hover:underline">
                      {row.budgetName}
                    </Link>
                    <div className="text-muted-foreground text-xs">{row.budgetStatus}</div>
                  </TableCell>
                  <TableCell>
                    <div>{row.analyticName}</div>
                    <div className="text-muted-foreground text-xs">{row.analyticCode}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.type === "INCOME" ? "success" : "secondary"}>
                      {row.type === "INCOME" ? "Income" : "Expenses"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={row.committed} size="sm" />
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Drills down to the journal items behind the figure. */}
                    <Link
                      href={`/budgets/${row.budgetId}/lines/${row.lineId}`}
                      className="underline underline-offset-2"
                    >
                      <Amount value={row.achieved} size="sm" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <AchievementBar percent={row.achievedPercent} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={row.toAchieve} size="sm" />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <BudgetPie achieved={row.achieved} toAchieve={row.toAchieve} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {allRows.length > 0 ? (
          <ListPagination
            meta={meta}
            pathname="/reports/budget"
            searchParams={resolved}
            itemLabel="budget lines"
          />
        ) : null}
      </div>
    </ReportShell>
  );
}
