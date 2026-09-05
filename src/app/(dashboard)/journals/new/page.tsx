import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { listAccountOptions } from "@/modules/accounts/account-service";
import { createJournalAction } from "@/modules/journals/actions";
import { JournalForm } from "@/modules/journals/components/journal-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New journal" };

export default async function NewJournalPage() {
  await requirePermissionOrRedirect("master:create");

  const [accounts, paymentAccounts] = await Promise.all([
    listAccountOptions(),
    listAccountOptions({ kinds: ["CASH", "BANK"] }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="New journal" description="Add a journal for a class of transactions." />
      <JournalForm
        action={createJournalAction}
        accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
        paymentAccounts={paymentAccounts.map((a) => ({ id: a.id, label: a.label }))}
        submitLabel="Create journal"
      />
    </div>
  );
}
