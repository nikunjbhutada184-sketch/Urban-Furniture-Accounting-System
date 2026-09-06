import { PaymentStatus } from "@prisma/client";
import {
  type DocumentPdfInput,
  companyName,
  renderDocumentPdf,
} from "@/modules/shared/document-pdf";
import { type DbClient, prisma } from "@/server/db/prisma";
import { toAmountString } from "@/server/money";
import { getCustomerInvoice } from "./customer-invoice-service";

/**
 * A customer invoice, as a PDF.
 *
 * Loads through `getCustomerInvoice`, so the document carries exactly what the
 * screen shows. Only POSTED payments count towards what has been received --
 * a draft payment has not moved any money.
 */
export async function renderCustomerInvoicePdf(
  id: string,
  client: DbClient = prisma,
): Promise<{ pdf: Buffer; number: string }> {
  const [invoice, company] = await Promise.all([
    getCustomerInvoice(id, client),
    companyName(client),
  ]);

  const input: DocumentPdfInput = {
    kind: "invoice",
    companyName: company,
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
    sourceNumber: invoice.salesOrder?.number ?? null,
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      taxAmount: toAmountString(line.taxAmount),
      total: toAmountString(line.total),
    })),
    payments: invoice.allocations
      .filter((allocation) => allocation.payment.status === PaymentStatus.POSTED)
      .map((allocation) => ({
        number: allocation.payment.number,
        date: allocation.payment.paymentDate,
        method: allocation.payment.method,
        amount: toAmountString(allocation.amount),
      })),
  };

  return { pdf: await renderDocumentPdf(input), number: invoice.number };
}
