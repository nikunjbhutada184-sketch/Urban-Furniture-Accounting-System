import { Lock } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { entrySourceHref, getJournalEntry } from "@/modules/journal-entries/entry-queries";
import { requirePermissionOrRedirect } from "@/server/auth/session";
import { isAppError } from "@/server/errors";
import { toAmountString } from "@/server/money";

export const metadata: Metadata = { title: "Journal entry" };

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionOrRedirect("transaction:view");
  const { id } = await params;

  const entry = await getJournalEntry(id).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  const sourceHref = entrySourceHref(entry.sourceType, entry.sourceId);
  const isPosted = entry.status === "POSTED";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={entry.number}
        description={`${entry.journal.code} · ${entry.journal.name} — ${entry.date.toISOString().slice(0, 10)}`}
        action={{ label: "All entries", href: "/journal-entries" }}
      >
        <Badge variant={isPosted ? "success" : entry.status === "DRAFT" ? "secondary" : "destructive"}>
          {isPosted ? "Posted" : entry.status === "DRAFT" ? "Draft" : "Cancelled"}
        </Badge>
      </PageHeader>

      {isPosted ? (
        <div className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This entry is posted and immutable — the database itself refuses edits and deletes.
            A correction is made by posting a reversal.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Reference", value: entry.reference ?? "—" },
          { label: "Created by", value: entry.createdBy?.name ?? "—" },
          { label: "Posted by", value: entry.postedBy?.name ?? "—" },
          {
            label: "Posted at",
            value: entry.postedAt?.toISOString().slice(0, 10) ?? "—",
          },
        ].map((item) => (
          <Card key={item.label} className="card-float">
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="truncate text-sm font-medium">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      {(sourceHref || entry.reversalOf || entry.reversedBy) && (
        <Card className="card-float">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Related</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            {sourceHref ? (
              <Link href={sourceHref} className="underline underline-offset-2">
                Source document ({entry.sourceType})
              </Link>
            ) : null}
            {entry.reversalOf ? (
              <Link
                href={`/journal-entries/${entry.reversalOf.id}`}
                className="underline underline-offset-2"
              >
                Reverses {entry.reversalOf.number}
              </Link>
            ) : null}
            {entry.reversedBy ? (
              <Link
                href={`/journal-entries/${entry.reversedBy.id}`}
                className="underline underline-offset-2"
              >
                Reversed by {entry.reversedBy.number}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card className="card-float">
        <CardHeader>
          <CardTitle className="text-base">Journal items</CardTitle>
          <CardDescription>
            {entry.description ?? "Debits and credits must balance for a posted entry."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Analytic</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {entry.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`/general-ledger?account=${item.account.id}`}
                      className="hover:underline"
                    >
                      <span className="tabular text-muted-foreground mr-2 text-xs">
                        {item.account.code}
                      </span>
                      {item.account.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.contact?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {item.analyticAccount
                      ? `${item.analyticAccount.code} · ${item.analyticAccount.name}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.debit.isZero() ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Amount value={toAmountString(item.debit)} size="sm" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.credit.isZero() ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Amount value={toAmountString(item.credit)} size="sm" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell className="text-right">
                  <Amount value={toAmountString(entry.totalDebit)} size="sm" />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={toAmountString(entry.totalCredit)} size="sm" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
