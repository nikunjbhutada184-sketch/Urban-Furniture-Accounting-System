import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { listAccountOptions } from "@/modules/accounts/account-service";
import { createContactAction } from "@/modules/contacts/actions";
import { ContactForm } from "@/modules/contacts/components/contact-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage() {
  await requirePermissionOrRedirect("master:create");

  const [receivableAccounts, payableAccounts] = await Promise.all([
    listAccountOptions({ kinds: ["RECEIVABLE"] }),
    listAccountOptions({ kinds: ["PAYABLE"] }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="New contact" description="Add a customer or vendor." />
      <ContactForm
        action={createContactAction}
        receivableAccounts={receivableAccounts}
        payableAccounts={payableAccounts}
        submitLabel="Create contact"
      />
    </div>
  );
}
