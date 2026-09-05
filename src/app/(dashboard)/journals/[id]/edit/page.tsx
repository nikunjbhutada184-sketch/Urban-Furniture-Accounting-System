import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { listAccountOptions } from "@/modules/accounts/account-service";
import { updateJournalAction } from "@/modules/journals/actions";
import { JournalForm } from "@/modules/journals/components/journal-form";
import { countJournalReferences, getJournal } from "@/modules/journals/journal-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit journal" };

export default async function EditJournalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("master:update");
  const { id } = await params;

  const journal = await getJournal(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const [accounts, paymentAccounts, entryCount] = await Promise.all([
    listAccountOptions(),
    listAccountOptions({ kinds: ["CASH", "BANK"] }),
    countJournalReferences(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={journal.name} description="Edit this journal.">
        {journal.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
      </PageHeader>

      {entryCount > 0 ? (
        <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
          This journal has <span className="text-foreground font-medium">{entryCount}</span> entr
          {entryCount === 1 ? "y" : "ies"}, so its type is locked. Default accounts can still be
          changed — they only affect new documents.
        </p>
      ) : null}

      <JournalForm
        action={updateJournalAction.bind(null, id)}
        journal={journal}
        accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
        paymentAccounts={paymentAccounts.map((a) => ({ id: a.id, label: a.label }))}
        submitLabel="Save changes"
      />
    </div>
  );
}
