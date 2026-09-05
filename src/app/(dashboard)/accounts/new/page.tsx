import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { listParentOptions } from "@/modules/accounts/account-service";
import { createAccountAction } from "@/modules/accounts/actions";
import { AccountForm } from "@/modules/accounts/components/account-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage() {
  await requirePermissionOrRedirect("master:create");
  const parents = await listParentOptions();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="New account" description="Add a ledger account to the chart." />
      <AccountForm
        action={createAccountAction}
        parentOptions={parents.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
        submitLabel="Create account"
      />
    </div>
  );
}
