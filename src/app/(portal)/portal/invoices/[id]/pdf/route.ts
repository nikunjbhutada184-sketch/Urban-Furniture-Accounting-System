import { renderPortalInvoicePdf } from "@/modules/portal/invoice-pdf";
import { requirePermission } from "@/server/auth/session";
import { toErrorResponse } from "@/server/errors";

/** pdfkit reads its font metrics from disk, so this must be the Node runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A customer downloading their own invoice.
 *
 * The contact comes from the session, never the URL, and the lookup is scoped
 * by it — so another customer's invoice id produces a 404 rather than a file.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requirePermission("portal:view-own");
    const { id } = await params;

    if (!actor.contactId) {
      return new Response("Your login is not linked to a customer account.", { status: 403 });
    }

    const pdf = await renderPortalInvoicePdf({ contactId: actor.contactId, invoiceId: id });

    if (!pdf) {
      return new Response("Invoice not found.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice_${id}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    if (status === 500) console.error("Portal invoice PDF failed", error);

    return new Response(message, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
