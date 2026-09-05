import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams } from "@/lib/list-params";
import { IncomeExpenseChart } from "@/modules/reporting/components/income-expense-chart";
import { PeriodPicker } from "@/modules/reporting/components/period-picker";
import { QuickAccessCard } from "@/modules/reporting/components/quick-access";
import {
  getActiveBudgets,
  getDashboardOverview,
  getLedgerHealth,
  getMonthlySeries,
  getOpenBills,
  getOpenInvoices,
  getQuickAccessSummary,
  getRecentActivity,
} from "@/modules/reporting/dashboard-service";
import { parsePeriod } from "@/modules/reporting/report-service";
import { auth } from "@/server/auth";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The accounting dashboard.
 *
 * Every figure comes from the ledger and the document tables through the
 * reporting services. There are no placeholder or illustrative numbers here:
 * an empty database shows empty states, not invented data.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("report:view");
  const session = await auth();
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const [overview, monthly, activity, invoices, bills, budgets, health, quickAccess] =
    await Promise.all([
      getDashboardOverview(period),
      getMonthlySeries(period),
      getRecentActivity(),
      getOpenInvoices(),
      getOpenBills(),
      getActiveBudgets(period),
      getLedgerHealth(period),
      getQuickAccessSummary(period),
    ]);

  const firstName = (session?.user?.name ?? "there").split(" ")[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome back, <span className="text-muted-foreground">{firstName}</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Figures for {period.from.toISOString().slice(0, 10)} to{" "}
            {period.to.toISOString().slice(0, 10)}, straight from the ledger.
          </p>
        </div>

        <PeriodPicker
          from={period.from.toISOString().slice(0, 10)}
          to={period.to.toISOString().slice(0, 10)}
        />
      </div>

      {!health.isBalanced ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-2xl border p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            The balance sheet does not balance — difference{" "}
            <span className="tabular font-medium">{health.difference}</span>.{" "}
            <Link href="/reports/trial-balance" className="underline underline-offset-2">
              Check the trial balance
            </Link>
            .
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <QuickAccessCard
          title="Sales"
          action={{ label: "New", href: "/sales/orders/new" }}
          tiles={[
            { label: "All", value: String(quickAccess.sales.all), href: "/sales/orders" },
            {
              label: "Confirmed",
              value: String(quickAccess.sales.confirmed),
              href: "/sales/orders?status=CONFIRMED",
            },
            {
              label: "Draft",
              value: String(quickAccess.sales.draft),
              href: "/sales/orders?status=DRAFT",
            },
          ]}
        />

        <QuickAccessCard
          title="Purchase"
          action={{ label: "New", href: "/purchases/orders/new" }}
          tiles={[
            { label: "All", value: String(quickAccess.purchase.all), href: "/purchases/orders" },
            {
              label: "Confirmed",
              value: String(quickAccess.purchase.confirmed),
              href: "/purchases/orders?status=CONFIRMED",
            },
            {
              label: "Draft",
              value: String(quickAccess.purchase.draft),
              href: "/purchases/orders?status=DRAFT",
            },
          ]}
        />

        <QuickAccessCard
          title="Budget Reports"
          action={{ label: "Report", href: "/reports/budget" }}
          tiles={[
            { label: "Budgets", value: String(quickAccess.budget.count), href: "/budgets" },
            {
              label: "Committed",
              value: quickAccess.budget.committed,
              money: true,
              href: "/reports/budget",
            },
            {
              label: "Achieved",
              value: quickAccess.budget.achieved,
              money: true,
              href: "/reports/budget",
            },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cash & bank"
          value={overview.cashAndBank}
          tone="primary"
          hint={`Cash ${overview.cash} · Bank ${overview.bank}`}
        />
        <StatCard
          label={overview.isProfit ? "Net profit" : "Net loss"}
          value={overview.netProfit}
          hint="Income less expenses"
          href="/reports/profit-and-loss"
        />
        <StatCard
          label="Receivables"
          value={overview.receivables}
          hint="Owed by customers"
          href="/reports/customer-outstanding"
        />
        <StatCard
          label="Payables"
          value={overview.payables}
          hint="Owed to vendors"
          href="/reports/vendor-outstanding"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Income vs expenses</CardTitle>
              <CardDescription>Posted movement per month across the period.</CardDescription>
            </div>
            <Link
              href="/reports/profit-and-loss"
              aria-label="Open the profit and loss report"
              className="bg-secondary text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded-full transition-colors"
            >
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart data={monthly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Totals</CardTitle>
            <CardDescription>For the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Total income", value: overview.totalIncome, href: "/sales/invoices" },
              { label: "Total expenses", value: overview.totalExpenses, href: "/purchases/bills" },
              { label: "Cash on hand", value: overview.cash, href: "/general-ledger" },
              { label: "Bank balance", value: overview.bank, href: "/general-ledger" },
            ].map((row) => (
              <Link
                key={row.label}
                href={row.href}
                className="hover:bg-secondary/70 -mx-2 flex items-center justify-between rounded-xl px-2 py-1.5 transition-colors"
              >
                <span className="text-muted-foreground text-sm">{row.label}</span>
                <Amount value={row.value} size="sm" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent journal entries</CardTitle>
            <CardDescription>The latest postings to the ledger.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {activity.length === 0 ? (
              <EmptyState
                title="Nothing posted yet"
                description="Post a bill or an invoice and it will appear here."
                action={{ label: "Customer invoices", href: "/sales/invoices" }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/journal-entries/${row.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.number}
                        </Link>
                        <div className="text-muted-foreground max-w-[16rem] truncate text-xs">
                          {row.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular">
                        {row.date.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Amount value={row.amount} size="sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Outstanding customer invoices</CardTitle>
              <CardDescription>Most urgent first.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {invoices.length === 0 ? (
                <EmptyState
                  title="Nothing outstanding"
                  description="Every posted invoice has been paid."
                  action={{ label: "View invoices", href: "/sales/invoices" }}
                />
              ) : (
                <Table>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>
                          <Link
                            href={`/sales/invoices/${invoice.id}`}
                            className="font-medium hover:underline"
                          >
                            {invoice.number}
                          </Link>
                          <div className="text-muted-foreground text-xs">{invoice.contactName}</div>
                        </TableCell>
                        <TableCell>
                          {invoice.isOverdue ? (
                            <Badge variant="destructive">Overdue</Badge>
                          ) : (
                            <span className="text-muted-foreground tabular text-xs">
                              {invoice.dueDate?.toISOString().slice(0, 10) ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={invoice.outstanding} size="sm" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Outstanding vendor bills</CardTitle>
              <CardDescription>What Urban Furniture owes.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {bills.length === 0 ? (
                <EmptyState
                  title="Nothing outstanding"
                  description="Every posted bill has been paid."
                  action={{ label: "View bills", href: "/purchases/bills" }}
                />
              ) : (
                <Table>
                  <TableBody>
                    {bills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell>
                          <Link
                            href={`/purchases/bills/${bill.id}`}
                            className="font-medium hover:underline"
                          >
                            {bill.number}
                          </Link>
                          <div className="text-muted-foreground text-xs">{bill.contactName}</div>
                        </TableCell>
                        <TableCell>
                          {bill.isOverdue ? (
                            <Badge variant="destructive">Overdue</Badge>
                          ) : (
                            <span className="text-muted-foreground tabular text-xs">
                              {bill.dueDate?.toISOString().slice(0, 10) ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={bill.outstanding} size="sm" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {budgets.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active budgets</CardTitle>
            <CardDescription>
              Committed and achieved are derived from confirmed orders and the posted ledger.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Budget</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Achieved</TableHead>
                  <TableHead className="text-right">Achieved %</TableHead>
                  <TableHead className="text-right">To achieve</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((budget) => (
                  <TableRow key={budget.id}>
                    <TableCell>
                      <Link href={`/budgets/${budget.id}`} className="font-medium hover:underline">
                        {budget.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={budget.committed} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={budget.achieved} size="sm" />
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {budget.achievedPercent === null ? "—" : `${budget.achievedPercent}%`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={budget.toAchieve} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Signed in as {actor.role}. Every figure is computed from posted journal entries at request
        time — nothing on this page is stored or hardcoded.
      </p>
    </div>
  );
}
