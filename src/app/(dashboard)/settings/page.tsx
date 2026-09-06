import { type Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CompanySettingsForm } from "@/modules/settings/components/company-settings-form";
import { getCompanySettings, listDefaultAccountChoices } from "@/modules/settings/settings-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Company Settings" };

export default async function CompanySettingsPage() {
  await requirePermissionOrRedirect("settings:manage");

  const [settings, accounts] = await Promise.all([
    getCompanySettings(),
    listDefaultAccountChoices(),
  ]);

  const lockDate = settings?.lockDate?.toISOString().slice(0, 10) ?? null;

  // Everything is serialised at this boundary: a Prisma Date or Decimal cannot
  // cross into a client component.
  const values = {
    name: settings?.name ?? "Urban Furniture",
    currencyCode: settings?.currencyCode ?? "INR",
    currencySymbol: settings?.currencySymbol ?? "Rs.",
    fiscalYearStartMonth: String(settings?.fiscalYearStartMonth ?? 4),
    lockDate: lockDate ?? "",
    defaultReceivableAccountId: settings?.defaultReceivableAccountId ?? "",
    defaultPayableAccountId: settings?.defaultPayableAccountId ?? "",
    defaultIncomeAccountId: settings?.defaultIncomeAccountId ?? "",
    defaultExpenseAccountId: settings?.defaultExpenseAccountId ?? "",
    defaultTaxPayableAccountId: settings?.defaultTaxPayableAccountId ?? "",
    defaultTaxInputAccountId: settings?.defaultTaxInputAccountId ?? "",
    addressLine1: settings?.addressLine1 ?? "",
    addressLine2: settings?.addressLine2 ?? "",
    city: settings?.city ?? "",
    state: settings?.state ?? "",
    pincode: settings?.pincode ?? "",
    email: settings?.email ?? "",
    phone: settings?.phone ?? "",
    taxNumber: settings?.taxNumber ?? "",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Company Settings"
        description="Identity, fiscal year, the accounting lock date and the engine's fallback accounts."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/audit">Audit log</Link>
        </Button>
      </PageHeader>

      <CompanySettingsForm settings={values} accounts={accounts} currentLockDate={lockDate} />
    </div>
  );
}
