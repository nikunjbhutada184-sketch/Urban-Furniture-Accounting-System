import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { listAccountOptions } from "@/modules/accounts/account-service";
import { updateContactAction } from "@/modules/contacts/actions";
import { ContactForm } from "@/modules/contacts/components/contact-form";
import { countContactReferences, getContact } from "@/modules/contacts/contact-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionOrRedirect("master:update");
  const { id } = await params;

  const contact = await getContact(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const [receivableAccounts, payableAccounts, references] = await Promise.all([
    listAccountOptions({ kinds: ["RECEIVABLE"] }),
    listAccountOptions({ kinds: ["PAYABLE"] }),
    countContactReferences(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={contact.name} description="Edit contact details.">
        {contact.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
      </PageHeader>

      {references > 0 ? (
        <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
          This contact is referenced by{" "}
          <span className="text-foreground font-medium">{references}</span> accounting record(s). It
          can be archived, but never deleted — accounting history must stay resolvable.
        </p>
      ) : null}

      <ContactForm
        action={updateContactAction.bind(null, id)}
        contact={contact}
        receivableAccounts={receivableAccounts}
        payableAccounts={payableAccounts}
        submitLabel="Save changes"
      />
    </div>
  );
}
