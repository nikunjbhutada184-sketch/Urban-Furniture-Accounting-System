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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { listCustomerOptions, listVendorOptions } from "@/modules/contacts/contact-service";
import { ReportShell } from "@/modules/reporting/components/report-shell";
import { getPartnerLedger } from "@/modules/reporting/partner-ledger-service";
import { parsePeriod } from "@/modules/reporting/report-service";
import { requireAccessScope, requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Partner Ledger" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const KIND_LABELS: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  receipt: "Receipt",
  payment: "Payment",
};

/**
 * One partner's statement: their documents and payments in date order with a
 * running balance, and an opening balance carrying in everything before the
 * period.
 */
export default async function PartnerLedgerPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("report:view");
  const resolved = await searchParams;
  const period = parsePeriod(resolved);

  const side = first(resolved.side) === "PAYABLE" ? "PAYABLE" : "RECEIVABLE";
  const isReceivable = side === "RECEIVABLE";
  const contactId = first(resolved.contact);

  const contacts = isReceivable ? await listCustomerOptions() : await listVendorOptions();

  // The service applies the scope itself and returns null for a contact the
  // caller may not read, so a forged id cannot reach another partner's ledger.
  const scope = await requireAccessScope();
  const ledger = contactId
    ? await getPartnerLedger({ contactId, period, side, scope })
    : null;

  const range = `from=${period.from.toISOString().slice(0, 10)}&to=${period.to
    .toISOString()
    .slice(0, 10)}`;

  return (
    <ReportShell
      title="Partner Ledger"
      description="Every document and payment for one partner, with a running balance."
      period={period}
      actions={
        <Link href="/reports/ageing" className="text-muted-foreground text-sm hover:underline">
          Ageing
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Partner side" className="flex gap-2">
          {[
            { value: "RECEIVABLE", label: "Customers" },
            { value: "PAYABLE", label: "Vendors" },
          ].map((option) => (
            <Link
              key={option.value}
              href={`/reports/partner-ledger?side=${option.value}&${range}`}
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
      </div>

      {!ledger ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Choose a {isReceivable ? "customer" : "vendor"}
            </CardTitle>
            <CardDescription>
              {contactId
                ? "That partner could not be found, or you are not allowed to view it."
                : "Their statement for the selected period loads next."}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {contacts.length === 0 ? (
              <EmptyState
                title={`No ${isReceivable ? "customers" : "vendors"} yet`}
                description="Create a contact first."
                action={{ label: "Contacts", href: "/contacts" }}
              />
            ) : (
              <ul className="divide-y">
                {contacts.map((contact) => (
                  <li key={contact.id}>
                    <Link
                      href={`/reports/partner-ledger?side=${side}&contact=${contact.id}&${range}`}
                      className="hover:bg-secondary/60 flex items-center justify-between px-4 py-3 text-sm transition-colors"
                    >
                      <span className="font-medium">{contact.name}</span>
                      <span className="text-muted-foreground text-xs">Open statement</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Opening balance" value={ledger.openingBalance} />
            <StatCard label="Movements" value={String(ledger.lines.length)} hint="In this period" />
            <StatCard
              label="Closing balance"
              value={ledger.closingBalance}
              tone="primary"
              hint={isReceivable ? "Owed by this customer" : "Owed to this vendor"}
            />
          </div>

          <Card className="card-float">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{ledger.contactName}</CardTitle>
                <CardDescription>
                  {isReceivable ? "Customer" : "Vendor"} statement. Debits increase the balance,
                  credits reduce it.
                </CardDescription>
              </div>
              <Link
                href={`/reports/partner-ledger?side=${side}&${range}`}
                className="text-muted-foreground text-sm hover:underline"
              >
                Change partner
              </Link>
            </CardHeader>

            <CardContent className="p-0">
              {ledger.lines.length === 0 ? (
                <EmptyState
                  title="Nothing in this period"
                  description={`The balance brought forward is ${ledger.openingBalance}. Widen the period to see earlier activity.`}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground italic">
                          Opening balance
                        </TableCell>
                        <TableCell className="text-right">
                          <Amount value={ledger.openingBalance} size="sm" signed />
                        </TableCell>
                      </TableRow>

                      {ledger.lines.map((line) => (
                        <TableRow key={`${line.kind}-${line.documentId}`}>
                          <TableCell className="text-muted-foreground tabular text-xs">
                            {line.date.toISOString().slice(0, 10)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                line.kind === "receipt" || line.kind === "payment"
                                  ? "success"
                                  : "secondary"
                              }
                            >
                              {KIND_LABELS[line.kind] ?? line.kind}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{line.reference}</TableCell>
                          <TableCell className="tabular text-right">
                            {Number(line.debit) === 0 ? "" : line.debit}
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {Number(line.credit) === 0 ? "" : line.credit}
                          </TableCell>
                          <TableCell className="text-right">
                            <Amount value={line.runningBalance} size="sm" signed />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>

                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={5}>Closing balance</TableCell>
                        <TableCell className="text-right">
                          <Amount value={ledger.closingBalance} size="sm" signed />
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </ReportShell>
  );
}
