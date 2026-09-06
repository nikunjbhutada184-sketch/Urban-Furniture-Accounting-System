import { type Metadata } from "next";
import { EmptyState } from "@/components/data-table/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalDocumentTable } from "@/modules/portal/components/portal-document-table";
import { listPortalBills, listPortalInvoices } from "@/modules/portal/portal-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "My invoices" };

export default async function PortalInvoicesPage() {
  const actor = await requirePermissionOrRedirect("portal:view-own");
  if (!actor.contactId) return null;

  const [invoices, bills] = await Promise.all([
    listPortalInvoices(actor.contactId),
    listPortalBills(actor.contactId),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My invoices</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything Urban Furniture has issued to you. Drafts are never shown.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Invoices</CardTitle>
          <CardDescription>Amounts you owe Urban Furniture.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Invoices appear here as soon as they are issued to you."
            />
          ) : (
            <PortalDocumentTable rows={invoices} basePath="/portal/invoices" />
          )}
        </CardContent>
      </Card>

      {bills.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bills</CardTitle>
            <CardDescription>Amounts Urban Furniture owes you as a supplier.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <PortalDocumentTable rows={bills} basePath={null} label="Bill" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
