import { renderCustomerInvoicePdf } from "@/modules/sales/invoice-pdf";
import { serveDocumentPdf } from "@/modules/shared/document-pdf-route";

/** pdfkit reads its font metrics from disk, so this must be the Node runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  return serveDocumentPdf("invoice", () => renderCustomerInvoicePdf(id));
}
