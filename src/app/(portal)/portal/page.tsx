import { AlertTriangle } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PortalDocumentTable } from "@/modules/portal/components/portal-document-table";
import { getPortalOverview, listPortalInvoices } from "@/modules/portal/portal-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "My account" };

export default async function PortalHomePage() {
  const actor = await requirePermissionOrRedirect("portal:view-own");

  // A portal login with no linked contact can see nothing at all — failing
  // closed rather than falling back to "everything".
  if (!actor.contactId) {
    return <UnlinkedAccount />;
  }

  const [overview, invoices] = await Promise.all([
    getPortalOverview(actor.contactId),
    listPortalInvoices(actor.contactId),
  ]);

  if (!overview) return <UnlinkedAccount />;

  const open = invoices.filter((invoice) => Number(invoice.outstanding) > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hello, <span className="text-muted-foreground">{overview.contactName}</span>
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your invoices and payments with Urban Furniture.
        </p>
      </div>

      {overview.overdueInvoiceCount > 0 ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-2xl border p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            You have {overview.overdueInvoiceCount} overdue{" "}
            {overview.overdueInvoiceCount === 1 ? "invoice" : "invoices"}.{" "}
            <Link href="/portal/invoices" className="underline underline-offset-2">
              Review and pay
            </Link>
            .
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Amount due"
          value={overview.outstandingInvoices}
          tone="primary"
          hint={`${overview.openInvoiceCount} open ${
            overview.openInvoiceCount === 1 ? "invoice" : "invoices"
          }`}
        />
        <StatCard label="Paid this year" value={overview.paidThisYear} hint="Receipts recorded" />
        <StatCard
          label="Owed to you"
          value={overview.outstandingBills}
          hint="If you also supply Urban Furniture"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Open invoices</CardTitle>
            <CardDescription>Everything still to pay, most urgent first.</CardDescription>
          </div>
          <Link href="/portal/invoices" className="text-muted-foreground text-sm hover:underline">
            All invoices
          </Link>
        </CardHeader>

        <CardContent className="p-0">
          {open.length === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              description="Every invoice issued to you has been paid in full."
              action={{ label: "View history", href: "/portal/invoices" }}
            />
          ) : (
            <PortalDocumentTable rows={open} basePath="/portal/invoices" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UnlinkedAccount() {
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account not linked</CardTitle>
          <CardDescription>
            Your login is not connected to a customer record yet, so there is nothing to show.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Please ask Urban Furniture to finish the setup. You will only ever be able to see
          documents belonging to your own account.
        </CardContent>
      </Card>
    </div>
  );
}
