"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type SignInState, signInAction } from "@/modules/auth/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Signing in...
        </>
      ) : (
        "Sign in"
      )}
    </Button>
  );
}

export function LoginForm({
  callbackUrl,
  justRegistered,
}: {
  callbackUrl?: string;
  justRegistered?: boolean;
}) {
  const [state, formAction] = useActionState<SignInState, FormData>(signInAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Enter your login id and password to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />

          {justRegistered && !state.error ? (
            <div
              role="status"
              className="border-success/30 bg-success/10 text-success flex items-start gap-2 rounded-md border p-3 text-sm"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Your account is ready. Sign in with the login id you chose.</span>
            </div>
          ) : null}

          {state.error ? (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{state.error}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="loginId">Login Id</Label>
            <Input
              id="loginId"
              name="loginId"
              type="text"
              autoComplete="username"
              placeholder="your login id"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={state.fieldErrors?.loginId ? true : undefined}
              aria-describedby={state.fieldErrors?.loginId ? "loginId-error" : undefined}
              required
            />
            {state.fieldErrors?.loginId ? (
              <p id="loginId-error" className="text-destructive text-xs">
                {state.fieldErrors.loginId}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={state.fieldErrors?.password ? true : undefined}
              aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
              required
            />
            {state.fieldErrors?.password ? (
              <p id="password-error" className="text-destructive text-xs">
                {state.fieldErrors.password}
              </p>
            ) : null}
          </div>

          <SubmitButton />

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
              href="/signup"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Sign Up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
