import { type Metadata } from "next";
import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ReportPdfLink } from "@/modules/reporting/components/report-pdf-link";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import {
  type ReportLine,
  getProfitAndLoss,
  parsePeriod,
} from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Profit & Loss" };

function Section({
  title,
  lines,
  total,
  totalLabel,
  period,
  emptyLabel,
}: {
  title: string;
  lines: ReportLine[];
  total: string;
  totalLabel: string;
  period: { from: Date; to: Date };
  emptyLabel: string;
}) {
  const range = `from=${period.from.toISOString().slice(0, 10)}&to=${period.to.toISOString().slice(0, 10)}`;

  return (
    <Card className="card-float">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground py-6 text-center text-sm">
                  {emptyLabel}
                </TableCell>
              </TableRow>
            ) : (
              lines.map((line) => (
                <TableRow key={line.accountId}>
                  <TableCell>
                    <Link
                      href={`/general-ledger?account=${line.accountId}&${range}`}
                      className="hover:underline"
                    >
                      <span className="tabular text-muted-foreground mr-2 text-xs">
                        {line.code}
                      </span>
                      {line.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount value={line.amount} size="sm" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell>{totalLabel}</TableCell>
              <TableCell className="text-right">
                <Amount value={total} size="sm" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const report = await getProfitAndLoss(period);

  return (
    <ReportShell
      title="Profit & Loss"
      description={`Income less expenses from ${period.from.toISOString().slice(0, 10)} to ${period.to.toISOString().slice(0, 10)}.`}
      period={period}
      actions={<ReportPdfLink href="/reports/profit-and-loss/pdf" period={period} />}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total income" value={report.totalIncome} />
        <StatCard label="Total expenses" value={report.totalExpenses} />
        <StatCard
          label={report.isProfit ? "Net profit" : "Net loss"}
          value={report.netProfit}
          tone="primary"
          hint="Total income − total expenses"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Income"
          lines={report.income}
          total={report.totalIncome}
          totalLabel="Total income"
          period={period}
          emptyLabel="No income posted in this period."
        />
        <Section
          title="Expenses"
          lines={report.expenses}
          total={report.totalExpenses}
          totalLabel="Total expenses"
          period={period}
          emptyLabel="No expenses posted in this period."
        />
      </div>

      <Card className="card-float">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Result</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Amount value={report.totalIncome} />
          <span className="text-muted-foreground">−</span>
          <Amount value={report.totalExpenses} />
          <span className="text-muted-foreground">=</span>
          <Amount value={report.netProfit} size="lg" signed />
          <Badge variant={report.isProfit ? "success" : "destructive"}>
            {report.isProfit ? "Profit" : "Loss"}
          </Badge>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
