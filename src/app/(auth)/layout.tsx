/**
 * Chrome shared by every page a signed-out visitor can reach.
 *
 * The logo, the ground and the card frame live here so sign in, sign up and
 * the forgot-password page cannot drift apart visually.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-ground flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="bg-card mx-auto mb-4 inline-flex items-center gap-2.5 rounded-2xl border px-5 py-3">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-xs font-bold">
              UF
            </span>
            <span className="text-sm font-semibold tracking-tight">Urban Furniture</span>
          </div>
          <p className="text-muted-foreground text-sm">Accounting System</p>
        </div>

        {children}
      </div>
    </main>
  );
}
