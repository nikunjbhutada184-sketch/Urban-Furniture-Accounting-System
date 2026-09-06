"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IDLE_STATE } from "@/modules/shared/action-state";
import { updateCompanySettingsAction } from "@/modules/settings/actions";
import { FISCAL_YEAR_MONTHS } from "@/modules/settings/schemas";

export interface AccountChoiceView {
  id: string;
  code: string;
  name: string;
}

/** All settings, serialised — no Prisma value may cross into a client component. */
export interface CompanySettingsValues {
  name: string;
  currencyCode: string;
  currencySymbol: string;
  fiscalYearStartMonth: string;
  lockDate: string;
  defaultReceivableAccountId: string;
  defaultPayableAccountId: string;
  defaultIncomeAccountId: string;
  defaultExpenseAccountId: string;
  defaultTaxPayableAccountId: string;
  defaultTaxInputAccountId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  email: string;
  phone: string;
  taxNumber: string;
}

export interface AccountChoices {
  receivable: AccountChoiceView[];
  payable: AccountChoiceView[];
  income: AccountChoiceView[];
  expense: AccountChoiceView[];
  tax: AccountChoiceView[];
}

/**
 * One "default account" picker.
 *
 * Defined at module level rather than inside the form: a component created
 * during render is a new type on every keystroke, which remounts the select and
 * loses its open state.
 */
function AccountSelect({
  name,
  label,
  hint,
  options,
  defaultValue,
  error,
}: {
  name: keyof CompanySettingsValues;
  label: string;
  hint: string;
  options: AccountChoiceView[];
  defaultValue: string;
  error?: string;
}) {
  return (
    <Field name={name} label={label} error={error} hint={hint}>
      <Select name={name} defaultValue={defaultValue || "none"}>
        <SelectTrigger id={name}>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not set</SelectItem>
          {options.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.code} · {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function CompanySettingsForm({
  settings,
  accounts,
  currentLockDate,
}: {
  settings: CompanySettingsValues;
  accounts: AccountChoices;
  currentLockDate: string | null;
}) {
  const [state, formAction] = useActionState(updateCompanySettingsAction, IDLE_STATE);

  const error = (field: string) => state.fieldErrors?.[field];
  const previous = (state.values ?? {}) as Record<string, string | undefined>;
  const value = (field: keyof CompanySettingsValues) => previous[field] ?? settings[field];

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company</CardTitle>
          <CardDescription>Shown on reports and downloaded documents.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="name" label="Company name" error={error("name")} required>
              <Input
                {...fieldProps("name", error("name"))}
                defaultValue={value("name")}
                maxLength={160}
                required
              />
            </Field>
          </div>

          <Field name="email" label="Email" error={error("email")}>
            <Input
              {...fieldProps("email", error("email"))}
              type="email"
              defaultValue={value("email")}
            />
          </Field>

          <Field name="phone" label="Phone" error={error("phone")}>
            <Input
              {...fieldProps("phone", error("phone"))}
              defaultValue={value("phone")}
              maxLength={32}
            />
          </Field>

          <Field name="taxNumber" label="Tax number" error={error("taxNumber")}>
            <Input
              {...fieldProps("taxNumber", error("taxNumber"))}
              defaultValue={value("taxNumber")}
              maxLength={40}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting</CardTitle>
          <CardDescription>
            The lock date is enforced by the posting engine: no entry may be dated on or before it.
            It can be moved forwards, never back.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            name="currencyCode"
            label="Currency code"
            error={error("currencyCode")}
            hint="Three-letter ISO code."
            required
          >
            <Input
              {...fieldProps("currencyCode", error("currencyCode"))}
              defaultValue={value("currencyCode")}
              maxLength={3}
              required
            />
          </Field>

          <Field
            name="currencySymbol"
            label="Currency symbol"
            error={error("currencySymbol")}
            required
          >
            <Input
              {...fieldProps("currencySymbol", error("currencySymbol"))}
              defaultValue={value("currencySymbol")}
              maxLength={8}
              required
            />
          </Field>

          <Field
            name="fiscalYearStartMonth"
            label="Fiscal year starts"
            error={error("fiscalYearStartMonth")}
            required
          >
            <Select name="fiscalYearStartMonth" defaultValue={value("fiscalYearStartMonth") || "4"}>
              <SelectTrigger id="fiscalYearStartMonth">
                <SelectValue placeholder="Select a month" />
              </SelectTrigger>
              <SelectContent>
                {FISCAL_YEAR_MONTHS.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="sm:col-span-3">
            <Field
              name="lockDate"
              label="Accounting lock date"
              error={error("lockDate")}
              hint={
                currentLockDate
                  ? `Currently ${currentLockDate}. Books on or before this date are closed and cannot be moved back.`
                  : "Leave blank to keep every period open."
              }
            >
              <Input
                {...fieldProps("lockDate", error("lockDate"))}
                type="date"
                defaultValue={value("lockDate")}
                min={currentLockDate ?? undefined}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default accounts</CardTitle>
          <CardDescription>
            Used by the posting engine when a contact, product or journal does not override them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <AccountSelect
            name="defaultReceivableAccountId"
            label="Receivable (debtors)"
            hint="Where customer invoices post the amount owed."
            options={accounts.receivable}
            defaultValue={value("defaultReceivableAccountId")}
            error={error("defaultReceivableAccountId")}
          />
          <AccountSelect
            name="defaultPayableAccountId"
            label="Payable (creditors)"
            hint="Where vendor bills post the amount owed."
            options={accounts.payable}
            defaultValue={value("defaultPayableAccountId")}
            error={error("defaultPayableAccountId")}
          />
          <AccountSelect
            name="defaultIncomeAccountId"
            label="Income"
            hint="Fallback sales account for a product without one."
            options={accounts.income}
            defaultValue={value("defaultIncomeAccountId")}
            error={error("defaultIncomeAccountId")}
          />
          <AccountSelect
            name="defaultExpenseAccountId"
            label="Expense"
            hint="Fallback purchase account for a product without one."
            options={accounts.expense}
            defaultValue={value("defaultExpenseAccountId")}
            error={error("defaultExpenseAccountId")}
          />
          <AccountSelect
            name="defaultTaxPayableAccountId"
            label="Tax payable"
            hint="Output tax collected on sales."
            options={accounts.tax}
            defaultValue={value("defaultTaxPayableAccountId")}
            error={error("defaultTaxPayableAccountId")}
          />
          <AccountSelect
            name="defaultTaxInputAccountId"
            label="Tax input"
            hint="Input tax paid on purchases."
            options={accounts.tax}
            defaultValue={value("defaultTaxInputAccountId")}
            error={error("defaultTaxInputAccountId")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="addressLine1" label="Address" error={error("addressLine1")}>
              <Input
                {...fieldProps("addressLine1", error("addressLine1"))}
                defaultValue={value("addressLine1")}
                maxLength={200}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field name="addressLine2" label="Address line 2" error={error("addressLine2")}>
              <Input
                {...fieldProps("addressLine2", error("addressLine2"))}
                defaultValue={value("addressLine2")}
                maxLength={200}
              />
            </Field>
          </div>

          <Field name="city" label="City" error={error("city")}>
            <Input
              {...fieldProps("city", error("city"))}
              defaultValue={value("city")}
              maxLength={80}
            />
          </Field>

          <Field name="state" label="State" error={error("state")}>
            <Input
              {...fieldProps("state", error("state"))}
              defaultValue={value("state")}
              maxLength={80}
            />
          </Field>

          <Field name="pincode" label="Pincode" error={error("pincode")}>
            <Input
              {...fieldProps("pincode", error("pincode"))}
              defaultValue={value("pincode")}
              maxLength={16}
              inputMode="numeric"
            />
          </Field>
        </CardContent>
      </Card>

      <SubmitButton label="Save settings" pendingLabel="Saving..." />
    </form>
  );
}
