"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth";

/**
 * Sign-in / sign-out server actions.
 *
 * Errors are returned as form state rather than thrown, and are deliberately
 * vague: "invalid email or password" never reveals whether the account exists.
 */

const signInSchema = z.object({
  email: z.string().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  callbackUrl: z.string().optional(),
});

export type SignInState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
};

export async function signInAction(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        email: flattened.email?.[0],
        password: flattened.password?.[0],
      },
    };
  }

  const { email, password, callbackUrl } = parsed.data;

  try {
    // `signIn` throws a redirect on success, which Next.js handles.
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    // Redirects are signalled by a thrown error; let them propagate.
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
