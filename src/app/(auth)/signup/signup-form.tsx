"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Field, FormAlert, SubmitButton, fieldProps } from "@/components/forms/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IDLE_STATE } from "@/modules/shared/action-state";
import { signUpAction } from "@/modules/users/actions";
import { PasswordRules } from "@/modules/users/components/password-rules";
import { LOGIN_ID_MAX, LOGIN_ID_MIN } from "@/modules/users/schemas";

/**
 * Self-service registration.
 *
 * Creates an invoicing (portal) account only. There is no role picker here by
 * design -- the server fixes the role, so nothing submitted from this form can
 * grant back-office access.
 */
export function SignUpForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(signUpAction, IDLE_STATE);

  useEffect(() => {
    if (state.status === "success") router.push("/login?registered=1");
  }, [state, router]);

  const error = (field: string) => state.fieldErrors?.[field];
  const previous = (state.values ?? {}) as Record<string, string | undefined>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
        <CardDescription>
          Creates an invoicing account: you will see and pay your own invoices and bills.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          <FormAlert state={state} />

          <Field name="name" label="Name" error={error("name")}>
            <Input
              {...fieldProps("name", error("name"))}
              defaultValue={previous.name ?? ""}
              placeholder="Your full name"
              maxLength={160}
              autoComplete="name"
            />
          </Field>

          <Field
            name="loginId"
            label="Enter Login Id"
            error={error("loginId")}
            hint={`${LOGIN_ID_MIN} to ${LOGIN_ID_MAX} characters, and not already taken.`}
            required
          >
            <Input
              {...fieldProps("loginId", error("loginId"))}
              defaultValue={previous.loginId ?? ""}
              minLength={LOGIN_ID_MIN}
              maxLength={LOGIN_ID_MAX}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </Field>

          <Field name="email" label="Enter Email Id" error={error("email")} required>
            <Input
              {...fieldProps("email", error("email"))}
              type="email"
              defaultValue={previous.email ?? ""}
              autoComplete="email"
              required
            />
          </Field>

          <Field name="password" label="Enter Password" error={error("password")} required>
            <Input
              {...fieldProps("password", error("password"))}
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>

          <PasswordRules />

          <Field
            name="confirmPassword"
            label="Re-Enter Password"
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

          <div className="[&>button]:w-full">
            <SubmitButton label="Sign up" pendingLabel="Creating account..." />
          </div>

          <p className="text-muted-foreground text-center text-sm">
            <Link
              href="/forgot-password"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Forgot Password
            </Link>
            <span className="px-2" aria-hidden>
              |
            </span>
            <Link
              href="/login"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Sign In
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
