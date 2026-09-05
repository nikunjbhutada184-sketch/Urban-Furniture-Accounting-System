import { type Metadata } from "next";
import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ReconciliationBanner,
  ReportShell,
} from "@/modules/reporting/components/report-shell";
import {
  type ReportLine,
  getBalanceSheet,
  parsePeriod,
} from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Balance Sheet" };

function Section({
  title,
  lines,
  total,
  totalLabel,
  extra,
  period,
}: {
  title: string;
  lines: ReportLine[];
  total: string;
  totalLabel: string;
  extra?: { label: string; amount: string };
  period: { from: Date; to: Date };
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
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground py-6 text-center text-sm">
                  No balances in this group.
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
                    <Amount value={line.amount} size="sm" signed />
                  </TableCell>
                </TableRow>
              ))
            )}

            {extra ? (
              <TableRow>
                <TableCell className="text-muted-foreground italic">{extra.label}</TableCell>
                <TableCell className="text-right">
                  <Amount value={extra.amount} size="sm" signed />
                </TableCell>
              </TableRow>
            ) : null}
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

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const report = await getBalanceSheet(period);

  return (
    <ReportShell
      title="Balance Sheet"
      description={`Assets, liabilities and capital as at ${period.to.toISOString().slice(0, 10)}.`}
      period={period}
    >
      <ReconciliationBanner
        isBalanced={report.isBalanced}
        balancedLabel="Assets = Liabilities + Capital. The balance sheet balances."
        unbalancedLabel="Assets do not equal Liabilities + Capital."
        difference={report.difference}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total assets" value={report.totalAssets} tone="primary" />
        <StatCard label="Total liabilities" value={report.totalLiabilities} />
        <StatCard
          label="Total capital"
          value={report.totalCapital}
          hint={`Includes ${report.netProfit} profit for the period`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Assets"
          lines={report.assets}
          total={report.totalAssets}
          totalLabel="Total assets"
          period={period}
        />

        <div className="space-y-4">
          <Section
            title="Liabilities"
            lines={report.liabilities}
            total={report.totalLiabilities}
            totalLabel="Total liabilities"
            period={period}
          />

          <Section
            title="Capital"
            lines={report.capital}
            total={report.totalCapital}
            totalLabel="Total capital"
            extra={{ label: "Profit for the period", amount: report.netProfit }}
            period={period}
          />
        </div>
      </div>

      <Card className="card-float">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">The accounting equation</CardTitle>
          <CardDescription>
            Income and expense accounts are not closed into capital until year end, so this
            period&apos;s profit is folded into capital here to make the equation hold.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Amount value={report.totalAssets} />
          <span className="text-muted-foreground">=</span>
          <Amount value={report.totalLiabilities} />
          <span className="text-muted-foreground">+</span>
          <Amount value={report.totalCapital} />
        </CardContent>
      </Card>
    </ReportShell>
  );
}
