import { type Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { createAnalyticAction } from "@/modules/analytic/actions";
import { AnalyticForm } from "@/modules/analytic/components/analytic-form";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "New analytic account" };

export default async function NewAnalyticPage() {
  await requirePermissionOrRedirect("master:create");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="New analytic account"
        description="Add a project, department or business unit."
      />
      <AnalyticForm action={createAnalyticAction} submitLabel="Create analytic account" />
    </div>
  );
}
