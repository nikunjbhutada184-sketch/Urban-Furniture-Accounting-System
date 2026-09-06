import { UserRole } from "@prisma/client";
import { type Metadata } from "next";
import { EmptyState } from "@/components/data-table/empty-state";
import { ListPagination } from "@/components/data-table/list-pagination";
import { ListToolbar } from "@/components/data-table/list-toolbar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type RawSearchParams, buildPageMeta, parseListParams } from "@/lib/list-params";
import { DocumentActionButton } from "@/modules/shared/components/document-action-button";
import { setUserActiveAction } from "@/modules/users/actions";
import { USER_ROLE_LABELS } from "@/modules/users/schemas";
import { countUsers, listUsers } from "@/modules/users/user-service";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Users" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const ROLE_FILTER_OPTIONS = Object.values(UserRole).map((role) => ({
  value: role,
  label: USER_ROLE_LABELS[role],
}));

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requirePermissionOrRedirect("user:manage");
  const resolved = await searchParams;

  const search = (first(resolved.q) ?? "").trim();
  const roleFilter = first(resolved.role);
  const role = Object.values(UserRole).includes(roleFilter as UserRole)
    ? (roleFilter as UserRole)
    : undefined;

  const params = parseListParams({
    searchParams: resolved,
    allowedSorts: ["name"] as const,
    defaultSort: "name",
  });

  const [rows, total] = await Promise.all([
    listUsers({
      search: search || undefined,
      role,
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
    countUsers({ search: search || undefined, role }),
  ]);

  const meta = buildPageMeta(params, total);
  const isFiltered = Boolean(search || role);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Users"
        description="Who can sign in, and what their role lets them reach."
        action={{ label: "Create User", href: "/users/new" }}
      />

      <ListToolbar
        searchPlaceholder="Search by name, login id or email..."
        filters={[{ name: "role", label: "Role", options: ROLE_FILTER_OPTIONS }]}
      />

      <div className="rounded-xl border">
        {rows.length === 0 ? (
          <EmptyState
            variant={isFiltered ? "no-results" : undefined}
            title={isFiltered ? "No users match your filters" : "No users yet"}
            description={
              isFiltered
                ? "Try a different search term, or clear the filters."
                : "Create a login for your accountant or a customer."
            }
            action={isFiltered ? undefined : { label: "Create User", href: "/users/new" }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Login id</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Linked contact</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="tabular text-sm">{user.loginId}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === UserRole.ADMIN ? "default" : "secondary"}>
                      {USER_ROLE_LABELS[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.contactName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {user.id === actor.id ? (
                      <span className="text-muted-foreground text-xs">You</span>
                    ) : user.isActive ? (
                      <DocumentActionButton
                        action={setUserActiveAction.bind(null, user.id, false)}
                        label="Deactivate"
                        title={`Deactivate ${user.name}?`}
                        description="They will no longer be able to sign in. Everything they have already recorded stays exactly as it is — nothing is deleted."
                        confirmLabel="Deactivate"
                        variant="outline"
                      />
                    ) : (
                      <DocumentActionButton
                        action={setUserActiveAction.bind(null, user.id, true)}
                        label="Reactivate"
                        title={`Reactivate ${user.name}?`}
                        description="They will be able to sign in again with their existing login id and password."
                        confirmLabel="Reactivate"
                        variant="outline"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {rows.length > 0 ? (
          <ListPagination meta={meta} pathname="/users" searchParams={resolved} itemLabel="users" />
        ) : null}
      </div>
    </div>
  );
}
