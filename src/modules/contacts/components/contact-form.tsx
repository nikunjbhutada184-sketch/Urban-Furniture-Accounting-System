"use client";

import { type Contact } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import { ImageUpload } from "@/components/forms/image-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ActionState, IDLE_STATE } from "@/modules/shared/action-state";
import { CONTACT_TYPE_OPTIONS } from "../schemas";

export interface AccountOption {
  id: string;
  code: string;
  name: string;
}

/**
 * Create/edit form for a contact.
 *
 * Validation is the server's Zod schema; this component only renders the
 * messages it returns. There is no duplicated client-side rule to drift.
 */
export function ContactForm({
  action,
  contact,
  receivableAccounts,
  payableAccounts,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  contact?: Contact;
  receivableAccounts: AccountOption[];
  payableAccounts: AccountOption[];
  submitLabel: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, IDLE_STATE);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/contacts");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const previous = (state.values ?? {}) as Record<string, string | undefined>;
  const initial = (field: keyof Contact, fallback = "") =>
    previous[field] ?? (contact?.[field] as string | null | undefined) ?? fallback;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <FormAlert state={state} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field name="name" label="Name" error={error("name")} required>
              <Input
                {...fieldProps("name", error("name"))}
                defaultValue={initial("name")}
                placeholder="e.g. Azure Furniture"
                maxLength={160}
                autoFocus
                required
              />
            </Field>
          </div>

          <Field
            name="type"
            label="Type"
            error={error("type")}
            hint="Decides whether this contact can appear on purchases, sales, or both."
            required
          >
            <Select name="type" defaultValue={previous.type ?? contact?.type ?? "CUSTOMER"}>
              <SelectTrigger id="type" aria-invalid={error("type") ? true : undefined}>
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field name="mobile" label="Mobile" error={error("mobile")}>
            <Input
              {...fieldProps("mobile", error("mobile"))}
              defaultValue={initial("mobile")}
              placeholder="+91 98200 00000"
              maxLength={32}
              inputMode="tel"
            />
          </Field>

          <Field
            name="email"
            label="Email"
            error={error("email")}
            hint="Required later if this contact needs a portal login."
          >
            <Input
              {...fieldProps("email", error("email"))}
              type="email"
              defaultValue={initial("email")}
              placeholder="accounts@example.com"
            />
          </Field>

          <div className="sm:col-span-2">
            <ImageUpload
              name="profileImage"
              label="Profile photo"
              hint="Shown on the kanban cards. PNG, JPEG, WebP or GIF, up to 2 MB."
              defaultValue={initial("profileImage")}
              fallback={(initial("name") || "?").slice(0, 2).toUpperCase()}
              error={error("profileImage")}
            />
          </div>
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
                defaultValue={initial("addressLine1")}
                placeholder="Street address"
                maxLength={200}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field name="addressLine2" label="Address line 2" error={error("addressLine2")}>
              <Input
                {...fieldProps("addressLine2", error("addressLine2"))}
                defaultValue={initial("addressLine2")}
                maxLength={200}
              />
            </Field>
          </div>

          <Field name="city" label="City" error={error("city")}>
            <Input
              {...fieldProps("city", error("city"))}
              defaultValue={initial("city")}
              maxLength={80}
            />
          </Field>

          <Field name="state" label="State" error={error("state")}>
            <Input
              {...fieldProps("state", error("state"))}
              defaultValue={initial("state")}
              maxLength={80}
            />
          </Field>

          <Field name="pincode" label="Pincode" error={error("pincode")}>
            <Input
              {...fieldProps("pincode", error("pincode"))}
              defaultValue={initial("pincode")}
              maxLength={16}
              inputMode="numeric"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounting defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            name="receivableAccountId"
            label="Receivable account"
            error={error("receivableAccountId")}
            hint="Leave blank to use the company default (Debtors)."
          >
            <Select
              name="receivableAccountId"
              defaultValue={previous.receivableAccountId ?? contact?.receivableAccountId ?? "none"}
            >
              <SelectTrigger id="receivableAccountId">
                <SelectValue placeholder="Company default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Company default</SelectItem>
                {receivableAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} · {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            name="payableAccountId"
            label="Payable account"
            error={error("payableAccountId")}
            hint="Leave blank to use the company default (Creditors)."
          >
            <Select
              name="payableAccountId"
              defaultValue={previous.payableAccountId ?? contact?.payableAccountId ?? "none"}
            >
              <SelectTrigger id="payableAccountId">
                <SelectValue placeholder="Company default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Company default</SelectItem>
                {payableAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.code} · {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Button type="button" variant="ghost" asChild>
          <Link href="/contacts">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
