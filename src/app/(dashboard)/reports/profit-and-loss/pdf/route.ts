import { type NextRequest } from "next/server";
import {
  renderProfitAndLossPdf,
  reportFileName,
} from "@/modules/reporting/pdf/financial-report-pdf";
import { servePdf } from "@/modules/reporting/pdf/pdf-route";

/** pdfkit reads its font metrics from disk, so this must be the Node runtime. */
export const runtime = "nodejs";
/** Derived at request time from the ledger; never prerendered. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return servePdf(request, {
    render: (period) => renderProfitAndLossPdf(period),
    fileName: (period) => reportFileName("profit-and-loss", period),
  });
}
