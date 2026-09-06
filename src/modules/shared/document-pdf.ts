import { type InvoiceStatus } from "@prisma/client";
import { type ReportPdfInput, renderReportPdf } from "@/modules/reporting/pdf/report-pdf";
import { type DbClient, prisma } from "@/server/db/prisma";

/**
 * Customer invoices and vendor bills, as PDFs.
 *
 * One builder for both. The two documents differ in wording — who owes whom —
 * and in nothing else, so a second implementation would only be a second thing
 * to keep in step. It is also what the customer portal serves, so a customer
 * downloading their invoice and an accountant downloading the same invoice get
 * a byte-identical document.
 *
 * Like the report PDFs, this only lays out: every figure arrives as an exact
 * decimal string from the service that loaded the document, and nothing here
 * adds, subtracts or rounds.
 */

export type DocumentKind = "invoice" | "bill";

export interface DocumentPdfLine {
  description: string;
  quantity: string;
  unitPrice: string;
  taxAmount: string;
  total: string;
}

export interface DocumentPdfPayment {
  number: string;
  date: Date;
  method: string;
  amount: string;
}

export interface DocumentPdfInput {
  kind: DocumentKind;
  companyName: string;
  number: string;
  reference: string | null;
  /** The customer on an invoice, the vendor on a bill. */
  partnerName: string;
  documentDate: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  amountUntaxed: string;
  amountTax: string;
  amountTotal: string;
  amountPaid: string;
  amountResidual: string;
  lines: DocumentPdfLine[];
  payments: DocumentPdfPayment[];
  /** The order this came from, when it came from one. */
  sourceNumber?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The document's shape, kept pure so it can be asserted without a database. */
export function buildDocumentPdf(input: DocumentPdfInput): ReportPdfInput {
  const isInvoice = input.kind === "invoice";
  const outstanding = Number(input.amountResidual);

  const context = [
    input.reference ? `Reference: ${input.reference}` : null,
    input.sourceNumber ? `From ${input.sourceNumber}` : null,
    `Status: ${STATUS_LABELS[input.status] ?? input.status}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const document: ReportPdfInput = {
    companyName: input.companyName,
    title: `${isInvoice ? "Invoice" : "Bill"} ${input.number}`,
    periodLabel: `Dated ${formatDate(input.documentDate)}${
      input.dueDate ? ` · Due ${formatDate(input.dueDate)}` : ""
    }`,
    description: `${isInvoice ? "Billed to" : "Received from"} ${input.partnerName}${
      context ? ` · ${context}` : ""
    }`,
    summary: [
      { label: "Total", value: input.amountTotal },
      { label: isInvoice ? "Received" : "Paid", value: input.amountPaid },
      {
        label: isInvoice ? "Amount due" : "Amount owed",
        value: input.amountResidual,
        // Nothing left to settle is the good outcome on either side.
        tone: outstanding > 0 ? "negative" : "positive",
      },
    ],
    tables: [
      {
        title: "Items",
        columns: [
          { label: "Description", width: 0.44 },
          { label: "Qty", width: 0.12, align: "right", numeric: true },
          { label: "Unit price", width: 0.16, align: "right", numeric: true },
          { label: "Tax", width: 0.13, align: "right", numeric: true },
          { label: "Total", width: 0.15, align: "right", numeric: true },
        ],
        rows: input.lines.map((line) => [
          line.description,
          line.quantity,
          line.unitPrice,
          line.taxAmount,
          line.total,
        ]),
        total: { label: "Total", value: input.amountTotal },
        emptyLabel: `This ${isInvoice ? "invoice" : "bill"} has no lines.`,
      },
    ],
    closing: {
      label: `Subtotal ${input.amountUntaxed}  +  Tax ${input.amountTax}  −  ${
        isInvoice ? "Received" : "Paid"
      } ${input.amountPaid}`,
      value: `${isInvoice ? "Amount due" : "Amount owed"} ${input.amountResidual}`,
    },
  };

  if (input.payments.length > 0) {
    document.tables.push({
      title: isInvoice ? "Payments received" : "Payments made",
      columns: [
        { label: "Payment", width: 0.32 },
        { label: "Date", width: 0.28 },
        { label: "Method", width: 0.2 },
        { label: "Amount", width: 0.2, align: "right", numeric: true },
      ],
      rows: input.payments.map((payment) => [
        payment.number,
        formatDate(payment.date),
        payment.method,
        payment.amount,
      ]),
      total: {
        label: isInvoice ? "Total received" : "Total paid",
        value: input.amountPaid,
      },
      emptyLabel: "No payments recorded yet.",
    });
  }

  return document;
}

export async function renderDocumentPdf(input: DocumentPdfInput): Promise<Buffer> {
  return renderReportPdf(buildDocumentPdf(input));
}

/** The company's own name, so a printed document identifies who issued it. */
export async function companyName(client: DbClient = prisma): Promise<string> {
  const settings = await client.companySettings.findUnique({
    where: { id: "company" },
    select: { name: true },
  });

  return settings?.name ?? "Urban Furniture";
}

/** A filename that says what the document is and sorts by its number. */
export function documentFileName(kind: DocumentKind, number: string): string {
  const safe = number.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${kind}_${safe}.pdf`;
}
