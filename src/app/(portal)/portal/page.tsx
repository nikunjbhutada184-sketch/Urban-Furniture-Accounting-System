import { type Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "My documents" };

export default async function PortalHomePage() {
  const actor = await requirePermissionOrRedirect("portal:view-own");

  // Contact isolation: a portal user without a linked contact sees nothing.
  // Document queries in Phase 8 filter on exactly this id, server-side.
  const hasLinkedContact = Boolean(actor.contactId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My documents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your invoices, bills and payments with Urban Furniture.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {hasLinkedContact ? "Nothing here yet" : "Account not linked"}
          </CardTitle>
          <CardDescription>
            {hasLinkedContact
              ? "Invoices and bills will appear here once they are issued to you. Online payment arrives in Phase 8."
              : "Your login is not linked to a contact record. Please ask Urban Furniture to complete the setup."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          You can only ever see documents belonging to your own account.
        </CardContent>
      </Card>
    </div>
  );
}
