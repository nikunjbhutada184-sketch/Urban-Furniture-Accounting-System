import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { isKnownRole } from "@/server/auth/permissions";
import { getCurrentActor, homePathForRole } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; registered?: string }>;
}) {
  // Only send a *usable* session on to its home. A session carrying a role
  // this build does not recognise must be allowed to sign in again here --
  // redirecting it would bounce straight back and the browser would report
  // "too many redirects".
  const actor = await getCurrentActor();
  if (actor && isKnownRole(actor.role)) redirect(homePathForRole(actor.role));

  const { callbackUrl, registered } = await searchParams;

  return <LoginForm callbackUrl={callbackUrl} justRegistered={registered === "1"} />;
}
