import {
  type DocumentPdfInput,
  companyName,
  renderDocumentPdf,
} from "@/modules/shared/document-pdf";
import { type DbClient, prisma } from "@/server/db/prisma";
import { toAmountString } from "@/server/money";
import { getPortalInvoice } from "./portal-service";

/**
 * A customer's own invoice, as a PDF.
 *
 * Built by the same `document-pdf` layer the back office uses, so a customer
 * downloading their invoice and an accountant downloading the same invoice get
 * an identical document. Only the lookup differs: `getPortalInvoice` is scoped
 * by `customerId`, so this cannot render an invoice the caller may not see —
 * it cannot load one.
 */
export async function renderPortalInvoicePdf(
  params: { contactId: string; invoiceId: string },
  client: DbClient = prisma,
): Promise<Buffer | null> {
  const invoice = await getPortalInvoice(
    { contactId: params.contactId, invoiceId: params.invoiceId },
    client,
  );

  if (!invoice) return null;

  const input: DocumentPdfInput = {
    kind: "invoice",
    companyName: await companyName(client),
    number: invoice.number,
    reference: invoice.reference,
    partnerName: invoice.customer.name,
    documentDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    amountUntaxed: toAmountString(invoice.amountUntaxed),
    amountTax: toAmountString(invoice.amountTax),
    amountTotal: toAmountString(invoice.amountTotal),
    amountPaid: toAmountString(invoice.amountPaid),
    amountResidual: toAmountString(invoice.amountResidual),
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      taxAmount: toAmountString(line.taxAmount),
      total: toAmountString(line.total),
    })),
    // No status filter here: `getPortalInvoice` already restricts allocations
    // to posted payments in its own query.
    payments: invoice.allocations.map((allocation) => ({
      number: allocation.payment.number,
      date: allocation.payment.paymentDate,
      method: allocation.payment.method,
      amount: toAmountString(allocation.amount),
    })),
  };

  return renderDocumentPdf(input);
}
