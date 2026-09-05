import { Pencil } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { ArchiveDialog } from "@/components/data-table/archive-dialog";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { SortableHeader } from "@/components/data-table/sortable-header";
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
import { type RawSearchParams, buildPageMeta, parseListParams } from "@/lib/list-params";
import { archiveContactAction } from "@/modules/contacts/actions";
import { listContacts } from "@/modules/contacts/contact-service";
import {
  CONTACT_SORT_FIELDS,
  CONTACT_TYPE_LABELS,
  CONTACT_TYPE_OPTIONS,
} from "@/modules/contacts/schemas";
import { ARCHIVE_FILTER_OPTIONS, ARCHIVE_STATUS_VALUES } from "@/modules/shared/list-filters";
import { can } from "@/server/auth/permissions";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Contacts" };

const PATHNAME = "/contacts";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("master:view");
  const resolved = await searchParams;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: CONTACT_SORT_FIELDS,
    defaultSort: "name",
    allowedFilters: {
      type: CONTACT_TYPE_OPTIONS.map((option) => option.value),
      status: ARCHIVE_STATUS_VALUES,
    },
  });

  const { rows, total } = await listContacts(params);
  const meta = buildPageMeta(params, total);

  const canCreate = can(actor, "master:create");
  const canUpdate = can(actor, "master:update");
  const canArchive = can(actor, "master:archive");
  const isFiltered = Boolean(params.search) || Object.keys(params.filters).length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Contacts"
        description="Customers and vendors used across purchases, sales and payments."
        action={canCreate ? { label: "New contact", href: "/contacts/new" } : undefined}
      />

      <ListToolbar
        searchPlaceholder="Search name, email, mobile or city..."
        filters={[
          {
            name: "type",
            label: "Type",
            options: CONTACT_TYPE_OPTIONS.map((option) => ({ ...option })),
          },
          { name: "status", label: "Status", options: ARCHIVE_FILTER_OPTIONS },
        ]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          isFiltered ? (
            <EmptyState
              variant="no-results"
              title="No contacts match your filters"
              description="Try a different search term, or clear the filters to see every contact."
            />
          ) : (
            <EmptyState
              title="No contacts yet"
              description="Add the customers and vendors you trade with. They become selectable on purchase and sales documents."
              action={canCreate ? { label: "New contact", href: "/contacts/new" } : undefined}
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    field="name"
                    label="Name"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <SortableHeader
                    field="type"
                    label="Type"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead>Email</TableHead>
                  <TableHead>Mobile</TableHead>
                  <SortableHeader
                    field="city"
                    label="City"
                    pathname={PATHNAME}
                    searchParams={resolved}
                    currentSort={params.sort}
                    currentDirection={params.direction}
                  />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((contact) => (
                  <TableRow key={contact.id} className={contact.isArchived ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{contact.name}</span>
                        {contact.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
                        {contact.hasPortalUser ? <Badge variant="outline">Portal</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          contact.type === "CUSTOMER"
                            ? "default"
                            : contact.type === "VENDOR"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {CONTACT_TYPE_LABELS[contact.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{contact.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.mobile ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.city
                        ? `${contact.city}${contact.state ? `, ${contact.state}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/contacts/${contact.id}/edit`}>
                              <Pencil aria-hidden />
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                        {canArchive ? (
                          <ArchiveDialog
                            action={archiveContactAction.bind(
                              null,
                              contact.id,
                              !contact.isArchived,
                            )}
                            recordName={contact.name}
                            entityLabel="Contact"
                            isArchived={contact.isArchived}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <ListPagination
              meta={meta}
              pathname={PATHNAME}
              searchParams={resolved}
              itemLabel="contacts"
            />
          </>
        )}
      </div>
    </div>
  );
}
