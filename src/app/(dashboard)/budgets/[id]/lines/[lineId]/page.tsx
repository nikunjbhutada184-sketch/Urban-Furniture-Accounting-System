import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/data-table/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAchievedBreakdown } from "@/modules/budgets/budget-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Achieved amount" };

/** Links a journal entry back to the document that produced it. */
function sourceHref(sourceType: string | null, sourceId: string | null): string | null {
  if (!sourceType || !sourceId) return null;

  switch (sourceType) {
    case "CustomerInvoice":
      return `/sales/invoices/${sourceId}`;
    case "VendorBill":
      return `/purchases/bills/${sourceId}`;
    default:
      return null;
  }
}

export default async function BudgetLineDrilldownPage({
  params,
}: {
  params: Promise<{ id: string; lineId: string }>;
}) {
  await requirePermissionOrRedirect("budget:view");
  const { id, lineId } = await params;

  const breakdown = await getAchievedBreakdown(id, lineId).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={breakdown.line.analyticLabel}
        description={`Achieved amount for ${breakdown.budget.name}`}
        action={{ label: "Back to budget", href: `/budgets/${id}` }}
      >
        <Badge variant={breakdown.line.type === "INCOME" ? "success" : "secondary"}>
          {breakdown.line.type === "INCOME" ? "Income" : "Expenses"}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Planned", value: breakdown.line.planned },
          { label: "Achieved", value: breakdown.line.achieved },
          { label: "Entries", value: String(breakdown.rows.length) },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="tabular text-sm font-medium">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posted journal items</CardTitle>
          <CardDescription>
            Every posted entry inside {breakdown.budget.periodStart.toISOString().slice(0, 10)} to{" "}
            {breakdown.budget.periodEnd.toISOString().slice(0, 10)} carrying this analytic
            account.{" "}
            {breakdown.line.type === "INCOME"
              ? "Income counts credits less debits."
              : "Expenses count debits less credits."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {breakdown.rows.length === 0 ? (
            <EmptyState
              title="Nothing posted yet"
              description="No journal entries in this period carry this analytic account, so the achieved amount is zero."
              action={{ label: "Back to budget", href: `/budgets/${id}` }}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Contribution</TableHead>
                  <TableHead className="text-right">Running</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {breakdown.rows.map((row) => {
                  const href = sourceHref(row.sourceType, row.sourceId);

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground tabular">
                        {row.date.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {href ? (
                          <Link href={href} className="hover:underline">
                            {row.entryNumber}
                          </Link>
                        ) : (
                          row.entryNumber
                        )}
                        {row.description ? (
                          <div className="text-muted-foreground text-xs">{row.description}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.accountLabel}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.contactName ?? "—"}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {row.debit === "0.00" ? "" : row.debit}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {row.credit === "0.00" ? "" : row.credit}
                      </TableCell>
                      <TableCell className="tabular text-right">{row.contribution}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {row.runningTotal}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>

              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6}>Total achieved</TableCell>
                  <TableCell className="tabular text-right" />
                  <TableCell className="tabular text-right">{breakdown.total}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
