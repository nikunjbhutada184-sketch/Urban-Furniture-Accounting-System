"use client";

import { UserRole } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
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
import { IDLE_STATE } from "@/modules/shared/action-state";
import { createUserAction } from "@/modules/users/actions";
import { PasswordRules } from "@/modules/users/components/password-rules";
import { CREATABLE_ROLES, LOGIN_ID_MAX, LOGIN_ID_MIN } from "@/modules/users/schemas";

export interface LinkableContact {
  id: string;
  name: string;
  email: string | null;
}

/**
 * Administrator: create a login.
 *
 * The role radio decides what the account can reach, so the contact picker
 * only appears for the portal role -- a back-office login is never bound to a
 * single customer. Every rule shown here is re-checked by `createUserSchema`
 * and `createUser` on the server.
 */
export function CreateUserForm({ contacts }: { contacts: LinkableContact[] }) {
  const router = useRouter();
  const [state, formAction] = useActionState(createUserAction, IDLE_STATE);
  const [role, setRole] = useState<UserRole>(UserRole.ACCOUNTANT);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/users");
      router.refresh();
    }
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const previous = (state.values ?? {}) as Record<string, string | undefined>;

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
                defaultValue={previous.name ?? ""}
                placeholder="e.g. Priya Desai"
                maxLength={160}
                autoFocus
                required
              />
            </Field>
          </div>

          <Field
            name="loginId"
            label="Login id"
            error={error("loginId")}
            hint={`Unique, ${LOGIN_ID_MIN} to ${LOGIN_ID_MAX} characters.`}
            required
          >
            <Input
              {...fieldProps("loginId", error("loginId"))}
              defaultValue={previous.loginId ?? ""}
              minLength={LOGIN_ID_MIN}
              maxLength={LOGIN_ID_MAX}
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </Field>

          <Field
            name="email"
            label="E-mail id"
            error={error("email")}
            hint="Must not already exist in the database."
            required
          >
            <Input
              {...fieldProps("email", error("email"))}
              type="email"
              defaultValue={previous.email ?? ""}
              required
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Role</legend>

            {CREATABLE_ROLES.map((option) => (
              <label
                key={option.value}
                className="hover:bg-secondary/60 has-checked:border-primary has-checked:bg-secondary flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors"
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="accent-primary mt-0.5 size-4"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="text-muted-foreground block text-xs">{option.description}</span>
                </span>
              </label>
            ))}

            {error("role") ? (
              <p role="alert" className="text-destructive text-xs">
                {error("role")}
              </p>
            ) : null}
          </fieldset>

          {role === UserRole.CONTACT ? (
            <Field
              name="contactId"
              label="Linked contact"
              error={error("contactId")}
              hint="The only records this login will ever be able to see. Leave blank to create a new customer from the details above."
            >
              <Select name="contactId" defaultValue={previous.contactId ?? "none"}>
                <SelectTrigger id="contactId">
                  <SelectValue placeholder="Create a new customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Create a new customer</SelectItem>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      {contact.name}
                      {contact.email ? ` · ${contact.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field name="password" label="Password" error={error("password")} required>
            <Input
              {...fieldProps("password", error("password"))}
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>

          <Field
            name="confirmPassword"
            label="Re-enter password"
            error={error("confirmPassword")}
            required
          >
            <Input
              {...fieldProps("confirmPassword", error("confirmPassword"))}
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>

          <div className="sm:col-span-2">
            <PasswordRules />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SubmitButton label="Create" pendingLabel="Creating..." />
        <Button type="button" variant="ghost" asChild>
          <Link href="/users">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
