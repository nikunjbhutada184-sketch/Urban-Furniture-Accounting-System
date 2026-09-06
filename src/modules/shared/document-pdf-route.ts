import { documentFileName, type DocumentKind } from "@/modules/shared/document-pdf";
import { requirePermission } from "@/server/auth/session";
import { toErrorResponse } from "@/server/errors";

/**
 * The shared pipeline behind a document download:
 *
 *   authorise -> render -> stream as an attachment
 *
 * `transaction:view` is re-checked here rather than relied on from `proxy.ts`,
 * because a route handler can be requested directly with a crafted URL.
 */
export async function serveDocumentPdf(
  kind: DocumentKind,
  render: () => Promise<{ pdf: Buffer; number: string }>,
): Promise<Response> {
  try {
    await requirePermission("transaction:view");

    const { pdf, number } = await render();

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${documentFileName(kind, number)}"`,
        "Content-Length": String(pdf.byteLength),
        // Totals and residuals move as payments land; a cached copy goes stale.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    if (status === 500) console.error(`${kind} PDF generation failed`, error);

    return new Response(message, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
