import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { CreateUserForm } from "@/modules/users/components/create-user-form";
import { listLinkableContacts } from "@/modules/users/user-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create User" };

export default async function CreateUserPage() {
  await requirePermissionOrRedirect("user:manage");

  // Loaded here rather than in the client component: pages may not touch the
  // Prisma client, and the form must not either.
  const contacts = await listLinkableContacts();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Create User"
        description="Give someone a login and decide what it can reach."
      />

      <CreateUserForm contacts={contacts} />
    </div>
  );
}
