import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentActor, homePathForRole } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const actor = await getCurrentActor();
  if (actor) redirect(homePathForRole(actor.role));

  const { callbackUrl } = await searchParams;

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="bg-primary text-primary-foreground mx-auto mb-4 flex size-12 items-center justify-center rounded-xl text-lg font-semibold">
            UF
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Urban Furniture</h1>
          <p className="text-muted-foreground mt-1 text-sm">Accounting System</p>
        </div>

        <LoginForm callbackUrl={callbackUrl} />

        <p className="text-muted-foreground mt-6 text-center text-xs">
          Access is granted by the business owner. Contact them if you cannot sign in.
        </p>
      </div>
    </main>
  );
}
