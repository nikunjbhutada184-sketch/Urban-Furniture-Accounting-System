"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/server/auth";

/**
 * Sign-in / sign-out server actions.
 *
 * Errors are returned as form state rather than thrown, and are deliberately
 * vague: "Invalid Login Id or Password" never reveals whether the account
 * exists, so the form cannot be used to enumerate users.
 */

const signInSchema = z.object({
  loginId: z.string().trim().min(1, "Login id is required.").max(160),
  password: z.string().min(1, "Password is required."),
  callbackUrl: z.string().optional(),
});

export type SignInState = {
  error?: string;
  fieldErrors?: { loginId?: string; password?: string };
};

export async function signInAction(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    loginId: formData.get("loginId"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: {
        loginId: flattened.loginId?.[0],
        password: flattened.password?.[0],
      },
    };
  }

  const { loginId, password, callbackUrl } = parsed.data;

  try {
    // `signIn` throws a redirect on success, which Next.js handles.
    await signIn("credentials", {
      loginId,
      password,
      redirectTo: callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid Login Id or Password." };
    }
    // Redirects are signalled by a thrown error; let them propagate.
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
