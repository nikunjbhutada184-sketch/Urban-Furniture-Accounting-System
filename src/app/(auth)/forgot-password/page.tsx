import { type Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * Password recovery.
 *
 * Self-service reset needs a mail transport and single-use, expiring tokens.
 * Neither is configured, and a form that silently does nothing would be worse
 * than none at all -- so this page says plainly how a password gets reset
 * today rather than pretending to send an email.
 */
export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>How to get back into your account.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Email-based reset links are not switched on for this deployment. An administrator resets
          passwords directly from the Users screen.
        </p>

        <p className="text-muted-foreground">
          Ask the business owner to reset yours, then sign in with the new password and your usual
          login id.
        </p>

        <p className="text-center">
          <Link href="/login" className="hover:text-foreground underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
