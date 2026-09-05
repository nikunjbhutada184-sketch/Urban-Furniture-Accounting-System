import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { isKnownRole } from "@/server/auth/permissions";
import { getCurrentActor, homePathForRole } from "@/server/auth/session";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage() {
  // Someone already signed in has no use for a registration form.
  const actor = await getCurrentActor();
  if (actor && isKnownRole(actor.role)) redirect(homePathForRole(actor.role));

  return <SignUpForm />;
}
