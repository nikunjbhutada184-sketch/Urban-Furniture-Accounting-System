import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  countAccountReferences,
  getAccount,
  listParentOptions,
} from "@/modules/accounts/account-service";
import { updateAccountAction } from "@/modules/accounts/actions";
import { AccountForm } from "@/modules/accounts/components/account-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("master:update");
  const { id } = await params;

  const account = await getAccount(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const [parents, references] = await Promise.all([
    listParentOptions(id),
    countAccountReferences(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={`${account.code} · ${account.name}`}
        description="Edit this ledger account."
      >
        {account.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
      </PageHeader>

      {references > 0 ? (
        <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
          This account has <span className="text-foreground font-medium">{references}</span> posted
          journal item(s), so its type is locked — changing it would move posted history between the
          Balance Sheet and the Profit &amp; Loss.
        </p>
      ) : null}

      <AccountForm
        action={updateAccountAction.bind(null, id)}
        account={account}
        parentOptions={parents.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
        submitLabel="Save changes"
      />
    </div>
  );
}
