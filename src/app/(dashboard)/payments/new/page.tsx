import { JournalType, PaymentDirection } from "@prisma/client";
import { type Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type RawSearchParams } from "@/lib/list-params";
import { listCustomerOptions, listVendorOptions } from "@/modules/contacts/contact-service";
import { listJournalOptions } from "@/modules/journals/journal-service";
import { PaymentRegistrationForm } from "@/modules/payments/components/payment-registration-form";
import { listOpenDocuments } from "@/modules/payments/payment-registration";
import { requirePermissionOrRedirect } from "@/server/auth/session";

export const metadata: Metadata = { title: "Register Payment" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Register a payment that can settle several documents at once.
 *
 * Direction and contact are carried in the URL rather than in client state, so
 * the server can load exactly that contact's open documents. It also means the
 * half-filled screen is shareable and survives a reload.
 */
export default async function RegisterPaymentPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePermissionOrRedirect("payment:post");
  const resolved = await searchParams;

  const direction =
    first(resolved.direction) === PaymentDirection.OUTBOUND
      ? PaymentDirection.OUTBOUND
      : PaymentDirection.INBOUND;

  const isInbound = direction === PaymentDirection.INBOUND;
  const contactId = first(resolved.contact);

  // Receipts come from customers, payments go to vendors. Both loaders already
  // include contacts typed as BOTH.
  const contacts = isInbound ? await listCustomerOptions() : await listVendorOptions();

  const contact = contactId ? contacts.find((row) => row.id === contactId) : undefined;

  const [journals, documents] = await Promise.all([
    listJournalOptions([JournalType.BANK, JournalType.CASH]),
    contact ? listOpenDocuments({ contactId: contact.id, direction }) : Promise.resolve([]),
  ]);

  const switchHref = (next: PaymentDirection) =>
    `/payments/new?direction=${next}${contact && next === direction ? `&contact=${contact.id}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Register Payment"
        description="One receipt or payment, settling any number of open documents."
      />

      <div role="radiogroup" aria-label="Payment type" className="flex gap-2">
        {[
          { value: PaymentDirection.INBOUND, label: "Receive (from a customer)" },
          { value: PaymentDirection.OUTBOUND, label: "Send (to a vendor)" },
        ].map((option) => (
          <Link
            key={option.value}
            href={switchHref(option.value)}
            role="radio"
            aria-checked={direction === option.value}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-colors",
              direction === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {!contact ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Choose {isInbound ? "the customer paying you" : "the vendor you are paying"}
            </CardTitle>
            <CardDescription>
              Their open {isInbound ? "invoices" : "bills"} load next, ready to allocate against.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {contacts.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">
                No {isInbound ? "customers" : "vendors"} yet.{" "}
                <Link href="/contacts/new" className="underline underline-offset-2">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y">
                {contacts.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/payments/new?direction=${direction}&contact=${row.id}`}
                      className="hover:bg-secondary/60 flex items-center justify-between px-4 py-3 text-sm transition-colors"
                    >
                      <span className="font-medium">{row.name}</span>
                      <span className="text-muted-foreground text-xs">Select</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            <Link
              href={`/payments/new?direction=${direction}`}
              className="underline underline-offset-2"
            >
              Change contact
            </Link>
          </p>

          <PaymentRegistrationForm
            direction={direction}
            contactId={contact.id}
            contactName={contact.name}
            journals={journals.map((journal) => ({
              id: journal.id,
              label: `${journal.code} · ${journal.name}`,
              method: journal.type === JournalType.CASH ? "CASH" : "BANK",
            }))}
            documents={documents.map((document) => ({
              id: document.id,
              number: document.number,
              date: document.date.toISOString().slice(0, 10),
              dueDate: document.dueDate?.toISOString().slice(0, 10) ?? null,
              total: document.total,
              residual: document.residual,
            }))}
          />
        </>
      )}
    </div>
  );
}
