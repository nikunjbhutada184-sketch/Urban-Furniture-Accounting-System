import { type NextRequest } from "next/server";
import { type ReportPeriod, parsePeriod } from "@/modules/reporting/report-service";
import { requirePermission } from "@/server/auth/session";
import { toErrorResponse } from "@/server/errors";

/**
 * The shared pipeline behind every report download:
 *
 *   authorise -> parse the period -> render -> stream as an attachment
 *
 * A route handler is NOT covered by `proxy.ts` in every case, and it can be
 * requested directly with a crafted URL, so it re-checks `report:view` itself
 * exactly as the page does. Nothing about the request influences which rows
 * are read beyond the date range.
 */
export async function servePdf(
  request: NextRequest,
  options: {
    render: (period: ReportPeriod) => Promise<Buffer>;
    fileName: (period: ReportPeriod) => string;
  },
): Promise<Response> {
  try {
    await requirePermission("report:view");

    const period = parsePeriod(Object.fromEntries(request.nextUrl.searchParams));
    const pdf = await options.render(period);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        // `attachment` so the browser saves it rather than displaying it in a
        // tab the user then has to save by hand.
        "Content-Disposition": `attachment; filename="${options.fileName(period)}"`,
        "Content-Length": String(pdf.byteLength),
        // The figures are derived at request time; a cached copy would go
        // stale the moment anything is posted.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { message, status } = toErrorResponse(error);

    if (status === 500) {
      console.error("Report PDF generation failed", error);
    }

    return new Response(message, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
