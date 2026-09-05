import { type Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

const PHASES = [
  { phase: "Phase 0", name: "Foundation", status: "done" },
  { phase: "Phase 1", name: "Database layer", status: "done" },
  { phase: "Phase 2", name: "Accounting core & auth", status: "done" },
  { phase: "Phase 3", name: "Master data", status: "next" },
  { phase: "Phase 4", name: "Purchase flow", status: "planned" },
  { phase: "Phase 5", name: "Sales flow", status: "planned" },
  { phase: "Phase 6", name: "Payments & settlement", status: "planned" },
  { phase: "Phase 7", name: "Reporting", status: "planned" },
] as const;

export default async function DashboardPage() {
  const actor = await requirePermissionOrRedirect("report:view");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Signed in as <span className="text-foreground font-medium">{actor.role}</span>. Business
          screens arrive in the phases below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Accounting engine</CardDescription>
            <CardTitle className="text-base">Double-entry enforced</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Every posting is validated in the service layer and again by database constraints and
            triggers. An unbalanced entry cannot be written.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Your access</CardDescription>
            <CardTitle className="text-base">{actor.role}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {(
              [
                ["Master data", can(actor, "master:create")],
                ["Archive", can(actor, "master:archive")],
                ["Post entries", can(actor, "transaction:post")],
                ["Reports", can(actor, "report:view")],
                ["Users", can(actor, "user:manage")],
              ] as const
            ).map(([label, allowed]) => (
              <Badge key={label} variant={allowed ? "success" : "secondary"}>
                {label}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Money handling</CardDescription>
            <CardTitle className="tabular text-base">NUMERIC(18,2)</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            All amounts are exact decimals from Postgres through to the UI. No floating-point
            arithmetic touches money.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Implementation phases</CardTitle>
          <CardDescription>Tracked in TODO.md at the repository root.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {PHASES.map((item) => (
              <li key={item.phase} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <span className="text-muted-foreground text-xs font-medium">{item.phase}</span>
                  <p className="truncate text-sm font-medium">{item.name}</p>
                </div>
                <Badge
                  variant={
                    item.status === "done"
                      ? "success"
                      : item.status === "next"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {item.status === "done"
                    ? "Complete"
                    : item.status === "next"
                      ? "Next"
                      : "Planned"}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
