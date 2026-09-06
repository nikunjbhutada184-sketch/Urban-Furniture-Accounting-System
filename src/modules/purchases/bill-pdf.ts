import { PaymentStatus } from "@prisma/client";
import {
  type DocumentPdfInput,
  companyName,
  renderDocumentPdf,
} from "@/modules/shared/document-pdf";
import { type DbClient, prisma } from "@/server/db/prisma";
import { toAmountString } from "@/server/money";
import { getVendorBill } from "./vendor-bill-service";

/**
 * A vendor bill, as a PDF.
 *
 * The same layout as a customer invoice, worded from the other side: this is
 * what Urban Furniture owes rather than what it is owed.
 */
export async function renderVendorBillPdf(
  id: string,
  client: DbClient = prisma,
): Promise<{ pdf: Buffer; number: string }> {
  const [bill, company] = await Promise.all([getVendorBill(id, client), companyName(client)]);

  const input: DocumentPdfInput = {
    kind: "bill",
    companyName: company,
    number: bill.number,
    reference: bill.vendorReference,
    partnerName: bill.vendor.name,
    documentDate: bill.invoiceDate,
    dueDate: bill.dueDate,
    status: bill.status,
    amountUntaxed: toAmountString(bill.amountUntaxed),
    amountTax: toAmountString(bill.amountTax),
    amountTotal: toAmountString(bill.amountTotal),
    amountPaid: toAmountString(bill.amountPaid),
    amountResidual: toAmountString(bill.amountResidual),
    sourceNumber: bill.purchaseOrder?.number ?? null,
    lines: bill.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      taxAmount: toAmountString(line.taxAmount),
      total: toAmountString(line.total),
    })),
    payments: bill.allocations
      .filter((allocation) => allocation.payment.status === PaymentStatus.POSTED)
      .map((allocation) => ({
        number: allocation.payment.number,
        date: allocation.payment.paymentDate,
        method: allocation.payment.method,
        amount: toAmountString(allocation.amount),
      })),
  };

  return { pdf: await renderDocumentPdf(input), number: bill.number };
}
