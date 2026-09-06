import { type Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams } from "@/lib/list-params";
import { listAuditFacets, listAuditLog } from "@/modules/settings/settings-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Audit Log" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Where a given entity's audit row can be opened, when a screen exists for it. */
const ENTITY_LINKS: Record<string, (id: string) => string> = {
  CustomerInvoice: (id) => `/sales/invoices/${id}`,
  VendorBill: (id) => `/purchases/bills/${id}`,
  SalesOrder: (id) => `/sales/orders/${id}`,
  PurchaseOrder: (id) => `/purchases/orders/${id}`,
  Payment: (id) => `/payments/${id}`,
  JournalEntry: (id) => `/journal-entries/${id}`,
  Budget: (id) => `/budgets/${id}`,
  Contact: (id) => `/contacts/${id}/edit`,
  Product: (id) => `/products/${id}/edit`,
};

const DESTRUCTIVE_ACTIONS = new Set(["cancel", "archive", "reverse"]);

/**
 * The audit trail.
 *
 * Read-only, deliberately: rows are written inside the transaction they
 * describe and nothing in the system edits or deletes one. A trail that can be
 * tidied up is not a trail.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("audit:view");
  const resolved = await searchParams;

  const search = (first(resolved.q) ?? "").trim();
  const entity = first(resolved.entity);
  const action = first(resolved.action);

  const facets = await listAuditFacets();

  // Only values that actually exist are accepted, so a crafted query string
  // cannot smuggle anything into the WHERE clause.
  const [rows] = await Promise.all([
    listAuditLog({
      search: search || undefined,
      entity: entity && facets.entities.includes(entity) ? entity : undefined,
      action: action && facets.actions.includes(action) ? action : undefined,
    }),
  ]);

  const isFiltered = Boolean(search || entity || action);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Audit Log"
        description="Who did what, and when. Written inside the transaction it describes — nothing here can be edited or deleted."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">Company settings</Link>
        </Button>
      </PageHeader>

      <ListToolbar
        searchPlaceholder="Search the summary or record id..."
        filters={[
          {
            name: "entity",
            label: "Record type",
            options: facets.entities.map((value) => ({ value, label: value })),
          },
          {
            name: "action",
            label: "Action",
            options: facets.actions.map((value) => ({
              value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            })),
          },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <EmptyState
            variant={isFiltered ? "no-results" : undefined}
            title={isFiltered ? "No entries match your filters" : "Nothing recorded yet"}
            description={
              isFiltered
                ? "Try a different search term, or clear the filters."
                : "Entries appear here as soon as documents are created, posted or paid."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((row) => {
                  const href = ENTITY_LINKS[row.entity]?.(row.entityId);

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground tabular text-xs whitespace-nowrap">
                        {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      </TableCell>

                      <TableCell className="text-sm">
                        {row.userName ?? (
                          <span className="text-muted-foreground italic">System</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={
                            DESTRUCTIVE_ACTIONS.has(row.action)
                              ? "destructive"
                              : row.action === "post" || row.action === "pay"
                                ? "success"
                                : "secondary"
                          }
                        >
                          {row.action}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm">
                        {href ? (
                          <Link href={href} className="font-medium hover:underline">
                            {row.entity}
                          </Link>
                        ) : (
                          <span className="font-medium">{row.entity}</span>
                        )}
                      </TableCell>

                      <TableCell className="text-muted-foreground max-w-md text-sm">
                        {row.summary ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Showing the {rows.length} most recent {rows.length === 1 ? "entry" : "entries"}.
      </p>
    </div>
  );
}
