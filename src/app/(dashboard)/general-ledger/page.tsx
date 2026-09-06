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
import { listAccountOptions } from "@/modules/accounts/account-service";
import { AccountPicker } from "@/modules/reporting/components/account-picker";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import { getGeneralLedger, parsePeriod } from "@/modules/reporting/report-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "General Ledger" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GeneralLedgerPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const accounts = await listAccountOptions();
  const accountId = first(resolved.account) ?? accounts[0]?.id;

  const report = accountId ? await getGeneralLedger(accountId, period) : null;

  return (
    <ReportShell
      title="General Ledger"
      description="Every posted movement on one account, with a running balance."
      period={period}
      actions={<AccountPicker accounts={accounts} selected={accountId ?? ""} />}
    >
      {!report ? (
        <div className="card-float rounded-xl border">
          <EmptyState
            title="Select an account"
            description="Choose a ledger account to see its transactions for the period."
            action={{ label: "Chart of Accounts", href: "/accounts" }}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Opening balance" value={report.openingBalance} hint="Before this period" />
            <StatCard label="Debits" value={report.totalDebit} />
            <StatCard label="Credits" value={report.totalCredit} />
            <StatCard label="Closing balance" value={report.closingBalance} tone="primary" />
          </div>

          <div className="card-float rounded-xl border">
            {report.rows.length === 0 ? (
              <EmptyState
                title="No movement in this period"
                description={`Nothing was posted to ${report.account.code} ${report.account.name} between these dates.`}
                action={{ label: "Journal entries", href: "/journal-entries" }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={6} className="text-muted-foreground italic">
                      Opening balance
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={report.openingBalance} size="sm" signed />
                    </TableCell>
                  </TableRow>

                  {report.rows.map((row) => (
                    <TableRow key={row.itemId}>
                      <TableCell className="text-muted-foreground tabular">
                        {row.date.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/journal-entries/${row.entryId}`} className="hover:underline">
                          {row.entryNumber}
                        </Link>
                        <div className="text-muted-foreground text-xs">{row.journalCode}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {row.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.description ?? row.contactName ?? "—"}
                      </TableCell>
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
                      <TableCell className="text-right">
                        <Amount value={row.runningBalance} size="sm" signed />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>

                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>Closing balance</TableCell>
                    <TableCell className="text-right">
                      <Amount value={report.totalDebit} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={report.totalCredit} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={report.closingBalance} size="sm" signed />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </div>
        </>
      )}
    </ReportShell>
  );
}
