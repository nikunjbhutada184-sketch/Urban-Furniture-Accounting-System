import { type NextRequest } from "next/server";
import { csvFileName, csvResponse } from "@/modules/reporting/csv";
import { isCsvReport, renderReportCsv } from "@/modules/reporting/csv-reports";
import { parsePeriod } from "@/modules/reporting/report-service";
import { requirePermission } from "@/server/auth/session";
import { toErrorResponse } from "@/server/errors";

export const runtime = "nodejs";
/** Derived at request time from the ledger; never prerendered. */
export const dynamic = "force-dynamic";

/**
 * CSV export for every report: `/reports/export?report=<slug>&from=&to=`.
 *
 * One route rather than one per report. `report` is checked against a fixed
 * allow-list, so a crafted value cannot reach anything that is not a report,
 * and `report:view` is re-checked here because a route handler can be requested
 * directly.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    await requirePermission("report:view");

    const slug = request.nextUrl.searchParams.get("report") ?? undefined;

    if (!isCsvReport(slug)) {
      return new Response("Unknown report.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const period = parsePeriod(Object.fromEntries(request.nextUrl.searchParams));
    const csv = await renderReportCsv(slug, period);

    return csvResponse(csv, csvFileName(slug, period));
  } catch (error) {
    const { message, status } = toErrorResponse(error);
    if (status === 500) console.error("Report CSV export failed", error);

    return new Response(message, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
