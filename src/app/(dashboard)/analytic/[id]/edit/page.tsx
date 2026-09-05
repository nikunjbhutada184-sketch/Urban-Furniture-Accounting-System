import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { updateAnalyticAction } from "@/modules/analytic/actions";
import { countAnalyticReferences, getAnalyticAccount } from "@/modules/analytic/analytic-service";
import { AnalyticForm } from "@/modules/analytic/components/analytic-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit analytic account" };

export default async function EditAnalyticPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("master:update");
  const { id } = await params;

  const account = await getAnalyticAccount(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const references = await countAnalyticReferences(id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={account.name} description="Edit this analytic account.">
        {account.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
      </PageHeader>

      {references > 0 ? (
        <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
          Used by <span className="text-foreground font-medium">{references}</span> record(s), so
          its type is locked — changing it would re-sign existing budget comparisons.
        </p>
      ) : null}

      <AnalyticForm
        action={updateAnalyticAction.bind(null, id)}
        account={account}
        submitLabel="Save changes"
      />
    </div>
  );
}
